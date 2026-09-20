import * as cheerio from 'cheerio';
import type { ScrapedListing, SourceAdapter, UnitType } from '../types.js';
import { parseEuro, politeFetch } from './helpers.js';

/**
 * viviendasnuevas.com — new-build ("obra nueva") aggregator. This is the route
 * to developments that never appear on the resale portals.
 *
 * List pages carry name/address/status/delivery; PRICES live on each
 * promotion's detail page (typology tables — some promos are price-on-request
 * and get skipped). One listing per promotion, "desde" pricing.
 *
 * Detail fetches are expensive (2.5s each, ~90 promos), so a quick refresh
 * only covers page 1; the FULL sync sweeps everything.
 */
const BASE = 'https://viviendasnuevas.com/valencia/valencia/promociones/';
const FULL_PAGE_CAP = 12;
const QUICK_DETAIL_CAP = 15;

function num(text: string): number | null {
  const m = text.replace(/ |&nbsp;/g, ' ').match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,})/);
  return m ? Number(m[1].replace(/[.\s]/g, '')) : null;
}

export const viviendasnuevas: SourceAdapter = {
  name: 'viviendasnuevas',

  async fetch({ full, maxPages }): Promise<ScrapedListing[]> {
    const pageLimit = full ? FULL_PAGE_CAP : Math.min(maxPages ?? 1, 2);
    const promos: { url: string; slug: string; name: string; status: string; delivery: string | null; address: string | null; features: string[]; listPrice: number | null }[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= pageLimit; page++) {
      let html: string;
      try {
        html = await politeFetch(page === 1 ? BASE : `${BASE}?page=${page}`);
      } catch (err) {
        if (page === 1) throw err;
        break;
      }
      const $ = cheerio.load(html);
      const cards = $('.card-list__item');
      if (cards.length === 0) break;
      let newOnPage = 0;
      cards.each((_, el) => {
        const card = $(el);
        const link = card.find('a.card__link[href*="/promociones/"]').first();
        const url = link.attr('href') ?? '';
        const slug = url.split('/promociones/')[1]?.replace(/\/$/, '');
        if (!slug || seen.has(slug)) return;
        seen.add(slug);
        newOnPage++;
        const cardText = card.text().replace(/\s+/g, ' ');
        if (/todo vendido/i.test(cardText)) return; // sold out — not inventory
        promos.push({
          url,
          slug,
          name: card.find('.card__heading').first().text().trim() || link.text().trim(),
          status: card.find('.card_label').first().text().trim(),
          delivery: cardText.match(/Plazo:\s*([^.]{3,40}?)(?:\s{2,}|$|\.)/)?.[1]?.trim() ?? null,
          address: card.find('.card__caption').first().text().replace(/\s+/g, ' ').trim() || null,
          features: card
            .find('[data-tooltip]')
            .map((_i, f) => $(f).attr('data-tooltip') ?? '')
            .get()
            .filter(Boolean),
          // ~1 in 4 promos publishes a "desde" price right on the card
          // (€/m² figures excluded via the lookahead; parkings via the floor)
          listPrice: (() => {
            const m = cardText.match(/(\d{1,3}(?:[.,\s  ]\d{3})+)\s*€(?!\s*\/)/);
            const v = m ? Number(m[1].replace(/[.,\s  ]/g, '')) : null;
            return v && v >= 60000 ? v : null;
          })(),
        });
      });
      if (newOnPage === 0) break;
    }

    const detailCap = full ? promos.length : Math.min(promos.length, QUICK_DETAIL_CAP);
    const out: ScrapedListing[] = [];

    for (const [i, promo] of promos.entries()) {
      let $: cheerio.CheerioAPI | null = null;
      if (i < detailCap) {
        try {
          $ = cheerio.load(await politeFetch(promo.url));
        } catch {
          $ = null;
        }
      }

      const text = $ ? $('body').text().replace(/\s+/g, ' ') : '';
      // sold-out promotions are not purchasable inventory
      if (/todo vendido/i.test(promo.status) || /Estado\s*:?\s*Todo vendido/i.test(text)) continue;

      // the promo page's typology table — same rows the website shows.
      // Cells (in header order): Precio | Habs | Baños | M2 | Planta | Tipo | Nombre,
      // glued without whitespace and with "—" for missing values → parse per cell.
      const units: UnitType[] = [];
      const cellInt = (s: string | undefined): number | null =>
        s && /^\d{1,2}$/.test(s.trim()) ? Number(s.trim()) : null;
      $?.('.project-element').each((_, el) => {
        if (units.length >= 24) return;
        const row = $!(el);
        const cls = row.attr('class') ?? '';
        if (/flex-header/.test(cls) || !/\b(?:active|sold)\b/.test(cls)) return;
        // first child is an invisible <a class="cover"> — cells are the div children
        const cells = row
          .children('div')
          .map((_i, c) => $!(c).text().replace(/\s+/g, ' ').trim())
          .get();
        if (cells.length < 6) return;
        const [priceCell, habs, banos, m2, planta, tipo] = cells;
        const sqmNum = m2 ? Math.round(parseFloat(m2.replace(',', '.'))) : NaN;
        if (!Number.isFinite(sqmNum) || sqmNum < 25) return; // Local/Garaje/junk rows
        const sold = /\bsold\b/.test(cls) || /vendido/i.test(priceCell);
        const price = sold ? null : parseEuro(priceCell);
        units.push({
          price: price && price >= 60000 ? price : null,
          sold,
          rooms: cellInt(habs),
          baths: cellInt(banos),
          sqm: sqmNum,
          floor: cellInt(planta),
          type: tipo && tipo !== '—' ? tipo : null,
        });
      });
      const available = units.filter((u) => !u.sold);
      // a promo whose every unit is sold is sold out, whatever the label says
      if (units.length > 0 && available.length === 0) continue;

      // price: available units → typology-group prices → the card's "desde"
      const prices: number[] = available
        .map((u) => u.price)
        .filter((p): p is number => p !== null);
      if (promo.listPrice) prices.push(promo.listPrice);
      $?.('.project-element-group-subtype__price, .project-element-group-type__header').each((_, el) => {
        const p = parseEuro($!(el).text()) ?? num($!(el).text());
        if (p && p >= 60000) prices.push(p);
      });
      if (prices.length === 0) continue; // fully price-on-request

      const pool = available.length ? available : units;
      const rooms = pool.length ? Math.max(...pool.map((u) => u.rooms ?? 0)) || null : null;
      const baths = pool.length ? Math.max(...pool.map((u) => u.baths ?? 0)) || null : null;
      const sqm = pool.length ? Math.max(...pool.map((u) => u.sqm ?? 0)) || null : null;
      const ogImage = $?.('meta[property="og:image"]').attr('content') ?? null;
      const rawAddress =
        text.match(/([A-ZÁÉÍÓÚÑ][^|]{4,70},\s*\d{5},\s*[^,|]{2,40},\s*Valencia)/)?.[1]?.trim() ??
        promo.address;
      // the header text runs "Ref: ON-1234 0 reseñas <address>" together — strip the prefix
      const address = rawAddress?.replace(/^.*?reseñas\s*/i, '').trim() || rawAddress;
      const municipality = address?.match(/\d{5},\s*([^,]+),\s*Valencia/)?.[1]?.trim() ?? 'Valencia';
      const description = [
        `Obra nueva — ${promo.status || 'en comercialización'}`,
        promo.delivery ? `entrega ${promo.delivery}` : null,
        available.length
          ? `${available.length} viviendas disponibles (${units.length} tipologías)`
          : null,
        promo.features.length ? `Extras: ${promo.features.join(', ')}` : null,
        $ ? ($('meta[name="description"]').attr('content') ?? null) : null,
      ]
        .filter(Boolean)
        .join('. ');

      const st = promo.status.toLowerCase();
      out.push({
        source: 'viviendasnuevas',
        sourceId: promo.slug,
        url: promo.url,
        title: `Obra nueva — ${promo.name}`,
        propertyType: 'new development',
        isNewBuild: true,
        constructionStatus: /terminada/.test(st)
          ? 'done'
          : /obra/.test(st) // "En obra" / "Obra parada"
            ? 'building'
            : 'planned', // "En proyecto" and anything else pre-construction
        delivery: promo.delivery,
        price: Math.min(...prices), // "desde"
        rooms,
        bathrooms: baths,
        sqm,
        floor: null,
        isTopFloor: false,
        hasElevator: promo.features.some((f) => /ascensor/i.test(f)) ? true : null,
        buildingYear: new Date().getFullYear(), // it's new-build by definition
        address,
        neighborhood: null,
        municipality,
        lat: null,
        lng: null,
        description,
        units: units.length ? units : undefined,
        images: ogImage ? [ogImage] : [],
      });
    }

    return out;
  },
};
