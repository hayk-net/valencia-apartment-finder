import * as cheerio from 'cheerio';
import type { ScrapedListing, SourceAdapter } from '../types.js';
import { politeFetch } from './helpers.js';

/**
 * thinkSPAIN — English-language portal, fully server-rendered, no bot walls.
 * Every card carries a JSON analytics attribute with propertyID, price, beds,
 * baths, buildSqm and type — no fragile CSS selectors needed.
 */
const BASE = 'https://www.thinkspain.com/property-for-sale/valencia-city';
const FULL_PAGE_CAP = 80; // ~16 cards/page ≈ 1.3k listings

interface TsMeta {
  propertyID?: number;
  price?: number;
  beds?: number;
  baths?: number;
  buildSqm?: number;
  type?: string;
}

const TYPE_MAP: Record<string, string> = {
  flat: 'flat',
  apartment: 'apartment',
  penthouse: 'penthouse',
  studio: 'studio',
  duplex: 'duplex',
  house: 'house',
  villa: 'house',
  townhouse: 'house',
  'country house': 'house',
  bungalow: 'house',
};

export const thinkspain: SourceAdapter = {
  name: 'thinkspain',
  // pagination is JS-only (no URL scheme found) — we only ever see the top ~16,
  // so a "full" sweep must never deactivate the rest
  supportsFullSweep: false,

  async fetch({ full, maxPages }): Promise<ScrapedListing[]> {
    const limit = full ? FULL_PAGE_CAP : (maxPages ?? 10);
    const byId = new Map<string, ScrapedListing>();

    for (let page = 1; page <= limit; page++) {
      let html: string;
      try {
        html = await politeFetch(page === 1 ? BASE : `${BASE}?page=${page}`);
      } catch (err) {
        if (page === 1) throw err;
        console.error(`[thinkspain] stopping at page ${page}: ${(err as Error).message}`);
        break;
      }
      const $ = cheerio.load(html);
      const articles = $('article[data-base-twc-analytic-event-parameters]');
      if (articles.length === 0) break;

      let newOnPage = 0;
      articles.each((_, el) => {
        const art = $(el);
        let meta: TsMeta;
        let variant = '';
        let category4 = '';
        try {
          // attributes hold escaped JSON: {\"propertyID\":9448488,…}
          meta = JSON.parse((art.attr('data-base-twc-analytic-event-parameters') ?? '{}').replace(/\\"/g, '"'));
          const ecom = (art.attr('data-ecommerce-event') ?? '').replace(/\\"/g, '"');
          variant = ecom.match(/"item_variant":"([^"]*)"/)?.[1] ?? '';
          category4 = ecom.match(/"item_category4":"([^"]*)"/)?.[1] ?? '';
        } catch {
          return;
        }
        if (!meta.propertyID || !meta.price) return;
        const sourceId = String(meta.propertyID);
        if (byId.has(sourceId)) return;

        const img = art.find('img').first();
        const alt = img.attr('alt') ?? '';
        // "5 bedroom Flat for sale in El Mercat, Valencia city with garage - € 1,100,000 (Ref: …)"
        const title = alt.replace(/\s*-\s*€[\d,. ]+.*$/, '').trim() || `Property ${sourceId}`;
        const locMatch = alt.match(/ in ([^,]+), Valencia/i);
        const type = (meta.type ?? '').toLowerCase();

        byId.set(sourceId, {
          source: 'thinkspain',
          sourceId,
          url: `https://www.thinkspain.com/property-for-sale/${sourceId}`,
          title,
          propertyType: TYPE_MAP[type] ?? (type || 'flat'),
          isNewBuild: category4.includes('new'),
          constructionStatus: null,
          delivery: null,
          price: meta.price,
          rooms: meta.beds ?? null,
          bathrooms: meta.baths ?? null,
          sqm: meta.buildSqm || null,
          floor: null, // not exposed at list level
          isTopFloor: type === 'penthouse',
          hasElevator: /\blift\b/.test(variant) ? true : null,
          buildingYear: null,
          address: null,
          neighborhood: locMatch?.[1]?.trim() ?? null,
          municipality: 'Valencia',
          lat: null,
          lng: null,
          description: variant ? `Features: ${variant.split(',').join(', ')}` : null,
          images: img.attr('src') ? [img.attr('src')!] : [],
        });
        newOnPage++;
      });

      if (newOnPage === 0) break;
    }

    return [...byId.values()];
  },
};
