import * as cheerio from 'cheerio';
import type { ScrapedListing, SourceAdapter } from '../types.js';
import { elevatorFromText, extractFloor, intFrom, isHouseText, parseEuro, politeFetch, sleep, yearFromText } from './helpers.js';

/**
 * Habitaclia — server-rendered HTML, ~15 listings/page.
 * Page 1:  /viviendas-venta-valencia.htm
 * Page N:  /viviendas-venta-valencia-<N-1>.htm
 * ?ordenar=fec_mod_desc = newest first (verified), which makes small
 * incremental runs catch everything new since the last refresh.
 */
const BASE = 'https://www.habitaclia.com/viviendas-venta-valencia';
const SORT = 'ordenar=fec_mod_desc';
const FULL_PAGE_CAP = 300;

function pageUrl(page: number): string {
  return page === 0 ? `${BASE}.htm?${SORT}` : `${BASE}-${page}.htm?${SORT}`;
}

export const habitaclia: SourceAdapter = {
  name: 'habitaclia',

  async fetch({ full, maxPages }): Promise<ScrapedListing[]> {
    const limit = full ? FULL_PAGE_CAP : (maxPages ?? 10);
    const byId = new Map<string, ScrapedListing>();

    for (let page = 0; page < limit; page++) {
      let html: string;
      try {
        html = await politeFetch(pageUrl(page));
      } catch (err) {
        if (page === 0) throw err; // first page failing = real problem
        // transient throttling mid-sweep: cool off once before giving up —
        // an early break here once turned a full sweep into a partial one
        try {
          await sleep(20_000);
          html = await politeFetch(pageUrl(page));
        } catch {
          console.error(`[habitaclia] stopping at page ${page + 1}: ${(err as Error).message}`);
          break;
        }
      }
      const $ = cheerio.load(html);
      const articles = $('article.js-list-item[data-id]');
      if (articles.length === 0) break; // ran past the last page

      let newOnPage = 0;
      articles.each((_, el) => {
        const a = $(el);
        const sourceId = a.attr('data-id');
        if (!sourceId || byId.has(sourceId)) return;

        const href = (a.attr('data-href') ?? '').split('?')[0];
        const title = a.find('.list-item-title a').first().text().replace(/\s+/g, ' ').trim();
        const price = parseEuro(a.find('[itemprop="price"]').first().text());
        if (!href || !title || price === null) return;

        const location = a.find('.list-item-location span').first().text().trim();
        const [municipality, neighborhood] = location.split(/\s+-\s+/, 2);
        const feature = a.find('.list-item-feature').first().text();
        const description = a.find('.list-item-description').first().text().replace(/\s+/g, ' ').trim();
        const haystack = `${feature} ${description}`;
        const sellType = (a.attr('data-selltype') ?? '').toUpperCase();
        let img = a.find('.list-gallery-image img').first().attr('src') ?? null;
        if (img?.startsWith('//')) img = `https:${img}`;

        // posters put the floor in TITLE + DESCRIPTION, not structured fields;
        // houses talk about internal "plantas" which are not a floor at all
        const floorText = `${title} ${description}`;
        const subtype = (a.attr('data-propertysubtype') ?? 'flat').toLowerCase();
        const isHouse = subtype.includes('house') || subtype === 'chalet' || isHouseText(floorText);
        const { floor, topFloor } = extractFloor(floorText, isHouse);

        byId.set(sourceId, {
          source: 'habitaclia',
          sourceId,
          url: href,
          title,
          propertyType: isHouse ? 'house' : subtype,
          isNewBuild: sellType.includes('NEW'),
          constructionStatus: null,
          delivery: null,
          price,
          rooms: intFrom(feature, /(\d+)\s*habitacion/i) ?? intFrom(description, /(\d+)\s*(?:dormitorios|habitacion)/i),
          bathrooms: intFrom(haystack, /(\d+)\s*bañ/i),
          sqm: intFrom(feature, /(\d+)\s*m/i),
          floor,
          isTopFloor: topFloor,
          hasElevator: elevatorFromText(haystack),
          buildingYear: yearFromText(description),
          address: null,
          neighborhood: neighborhood ?? null,
          municipality: municipality ?? 'Valencia',
          lat: null,
          lng: null,
          description: description || null,
          images: img ? [img] : [],
        });
        newOnPage++;
      });

      if (newOnPage === 0) break; // page full of duplicates = pagination looped
    }

    return [...byId.values()];
  },
};
