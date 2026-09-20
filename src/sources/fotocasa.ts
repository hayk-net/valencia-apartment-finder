import * as cheerio from 'cheerio';
import type { ScrapedListing, SourceAdapter } from '../types.js';
import { politeFetch, sleep } from './helpers.js';

/**
 * Fotocasa — the search page embeds its full state as a JSON <script>
 * (initialSearch.result.realEstates, 30 ads/page). Far richer than the DOM:
 * GPS coordinates, structured address (district/neighborhood/zip), full prose
 * description, and STRUCTURED red flags (isBareOwnership/isOccupied/
 * isAuctioned/isRentedWithTenants) — the classic too-cheap-price traps.
 *
 * Floor is a feature with an ENUM value (decoded empirically from detail
 * pages): 3=bajo, 4=entresuelo, 5=principal, 6..30 = floor (value-5), 32="15+".
 */
const BASE = 'https://www.fotocasa.es/es/comprar/viviendas/valencia-capital/todas-las-zonas/l';
const SORT = 'sortType=publicationDate'; // newest first
const FULL_PAGE_CAP = 150;

function pageUrl(page: number): string {
  return page === 1 ? `${BASE}?${SORT}` : `${BASE}/${page}?${SORT}`;
}

interface FcFeature {
  key: string;
  value: number;
}

interface FcAd {
  id: number;
  rawPrice: number;
  detail?: Record<string, string>;
  buildingType?: string;
  buildingSubtype?: string;
  description?: string;
  location?: string;
  address?: {
    district?: string | null;
    neighborhood?: string | null;
    municipality?: string | null;
    zipCode?: string | null;
  };
  coordinates?: { latitude?: number; longitude?: number };
  features?: FcFeature[];
  multimedia?: { type: string; src: string }[];
  isNewConstruction?: boolean;
  isPromotion?: boolean;
  isBareOwnership?: boolean;
  isOccupied?: boolean;
  isAuctioned?: boolean;
  isRentedWithTenants?: boolean;
}

function decodeFloor(value: number): number | null {
  if (value === 3) return 0; // bajo / planta baja
  if (value === 4 || value === 5) return 1; // entresuelo / principal
  if (value >= 6 && value <= 30) return value - 5; // 6 = 1ª planta …
  if (value === 32) return 15; // "15ª or higher"
  return null; // 1/2 = basement levels — not meaningful for min-floor filters
}

const SUBTYPE_MAP: Record<string, string> = {
  Flat: 'flat',
  Apartment: 'apartment',
  Attic: 'penthouse',
  Study: 'studio',
  Duplex: 'duplex',
  Loft: 'loft',
  GroundFloor: 'ground floor',
  House_Chalet: 'house',
  Tower: 'house',
  RusticHouse: 'house',
};

function extractAds(html: string): { ads: FcAd[]; total: number | null } {
  const $ = cheerio.load(html);
  let best: { ads: FcAd[]; total: number | null } | null = null;
  $('script').each((_, s) => {
    const text = $(s).text().trim();
    if (!text.startsWith('{') || !text.includes('realEstates')) return;
    try {
      const data = JSON.parse(text) as {
        initialSearch?: { result?: { realEstates?: FcAd[]; count?: number } };
      };
      const ads = data.initialSearch?.result?.realEstates;
      if (Array.isArray(ads)) best = { ads, total: data.initialSearch?.result?.count ?? null };
    } catch {
      // not the state blob
    }
  });
  return best ?? { ads: [], total: null };
}

export const fotocasa: SourceAdapter = {
  name: 'fotocasa',

  async fetch({ full, maxPages }): Promise<ScrapedListing[]> {
    const limit = full ? FULL_PAGE_CAP : (maxPages ?? 10);
    const byId = new Map<string, ScrapedListing>();

    for (let page = 1; page <= limit; page++) {
      let html: string;
      try {
        html = await politeFetch(pageUrl(page));
      } catch (err) {
        if (page === 1) throw err;
        // cool off once before giving up mid-sweep (transient throttling)
        try {
          await sleep(20_000);
          html = await politeFetch(pageUrl(page));
        } catch {
          console.error(`[fotocasa] stopping at page ${page}: ${(err as Error).message}`);
          break;
        }
      }
      const { ads } = extractAds(html);
      if (ads.length === 0) break;

      let newOnPage = 0;
      for (const ad of ads) {
        const sourceId = String(ad.id ?? '');
        const href = ad.detail?.['es-ES'] ?? Object.values(ad.detail ?? {})[0];
        if (!sourceId || !href || !ad.rawPrice || byId.has(sourceId)) continue;

        const feature = (key: string): number | null =>
          ad.features?.find((f) => f.key === key)?.value ?? null;

        const floorCode = feature('floor');
        const subtype = ad.buildingSubtype ?? ad.buildingType ?? 'Flat';
        const propertyType = SUBTYPE_MAP[subtype] ?? subtype.toLowerCase();
        const isHouse = propertyType === 'house';

        const flags: string[] = [];
        if (ad.isBareOwnership) flags.push('nuda propiedad');
        if (ad.isOccupied) flags.push('ocupada');
        if (ad.isAuctioned) flags.push('subasta');
        if (ad.isRentedWithTenants) flags.push('alquilada con inquilino');

        const neighborhood = ad.address?.neighborhood || ad.address?.district || null;
        const municipality = (ad.address?.municipality ?? 'Valencia').replace(/\s*Capital$/i, '');
        const title = `${subtype === 'Attic' ? 'Ático' : propertyType === 'house' ? 'Casa' : 'Piso'}${
          ad.isNewConstruction || ad.isPromotion ? ' (obra nueva)' : ''
        } en ${ad.location || neighborhood || municipality}`;

        byId.set(sourceId, {
          source: 'fotocasa',
          sourceId,
          url: `https://www.fotocasa.es${href}`,
          title,
          propertyType,
          isNewBuild: !!(ad.isNewConstruction || ad.isPromotion),
          constructionStatus: null,
          delivery: null,
          price: ad.rawPrice,
          rooms: feature('rooms'),
          bathrooms: feature('bathrooms'),
          sqm: feature('surface'),
          floor: isHouse || floorCode === null ? null : decodeFloor(floorCode),
          isTopFloor: subtype === 'Attic' || floorCode === 32,
          hasElevator: feature('elevator') !== null ? true : null,
          buildingYear: null,
          address: ad.location ?? null,
          neighborhood,
          municipality,
          lat: ad.coordinates?.latitude ?? null,
          lng: ad.coordinates?.longitude ?? null,
          description: ad.description?.trim() || null,
          flags,
          images: (ad.multimedia ?? [])
            .filter((mm) => mm.type === 'image')
            .slice(0, 1)
            .map((mm) => mm.src),
        });
        newOnPage++;
      }

      if (newOnPage === 0) break; // pagination looped
    }

    return [...byId.values()];
  },
};
