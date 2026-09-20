import type { Listing, ScrapedListing, SourceAdapter } from '../types.js';
import { politeFetch } from './helpers.js';

/**
 * Metrovacesa — big national developer, THE source for future projects: their
 * catalogue states the construction phase ("Inicio de construcción",
 * "En construcción", "Llave en mano") and delivery dates. Pages embed a
 * `const promotions = [...]` JSON array (Astro SSR).
 *
 * Promotions without a published price (precio_numeric 0 — usually the very
 * earliest phase) are skipped until Metrovacesa prices them.
 */
const PAGES = [
  'https://metrovacesa.com/promociones/valencia/valencia-capital',
  'https://metrovacesa.com/promociones/valencia',
];

interface MvPromo {
  slug?: string;
  title?: { rendered?: string };
  link?: string;
  featured_media_url?: string;
  acf?: {
    status_promocion?: string;
    viviendas_disponibles?: string;
    precio_numeric?: number;
    metros_numeric?: number;
    dormitorios_range?: string;
    bedrooms?: string;
    delivery_date?: string;
    taxonomy?: string;
    tags?: [string, string][];
  };
}

function statusOf(acf: MvPromo['acf']): Listing['constructionStatus'] {
  const s = `${acf?.status_promocion ?? ''} ${(acf?.tags ?? []).flat().join(' ')}`.toLowerCase();
  if (/llave en mano|entrega inmediata|terminad/.test(s)) return 'done';
  if (/construcci/.test(s)) return 'building';
  return 'planned';
}

function maxNum(range: string | undefined): number | null {
  const nums = (range ?? '').match(/\d+/g);
  return nums && nums.length > 0 ? Math.max(...nums.map(Number)) : null;
}

export const metrovacesa: SourceAdapter = {
  name: 'metrovacesa',

  async fetch(): Promise<ScrapedListing[]> {
    const bySlug = new Map<string, ScrapedListing>();

    for (const pageUrl of PAGES) {
      let html: string;
      try {
        html = await politeFetch(pageUrl);
      } catch (err) {
        if (bySlug.size === 0 && pageUrl === PAGES[PAGES.length - 1]) throw err;
        continue;
      }
      const m = html.match(/const promotions = (\[.*?\]);/s);
      if (!m) continue;
      let promos: MvPromo[];
      try {
        promos = JSON.parse(m[1]) as MvPromo[];
      } catch {
        continue;
      }

      for (const p of promos) {
        const slug = p.slug ?? '';
        const name = p.title?.rendered?.trim();
        const price = p.acf?.precio_numeric ?? 0;
        if (!slug || !name || bySlug.has(slug)) continue;
        if (price < 60000) continue; // not priced yet — appears once published

        const status = statusOf(p.acf);
        const delivery = p.acf?.delivery_date?.trim() || null;
        // taxonomy "Valencia / Valencia" → province / municipality
        const municipality = p.acf?.taxonomy?.split('/')[1]?.trim() || 'Valencia';
        const available = p.acf?.viviendas_disponibles;

        bySlug.set(slug, {
          source: 'metrovacesa',
          sourceId: slug,
          url: p.link?.startsWith('http') ? p.link : `https://metrovacesa.com${p.link ?? ''}`,
          title: `Obra nueva — ${name}`,
          propertyType: 'new development',
          isNewBuild: true,
          constructionStatus: status,
          delivery,
          price,
          rooms: maxNum(p.acf?.dormitorios_range ?? p.acf?.bedrooms),
          bathrooms: null,
          sqm: p.acf?.metros_numeric || null,
          floor: null,
          isTopFloor: false,
          hasElevator: null,
          buildingYear: new Date().getFullYear(),
          address: null,
          neighborhood: null,
          municipality,
          lat: null,
          lng: null,
          description: [
            `Metrovacesa — ${p.acf?.status_promocion ?? 'obra nueva'}`,
            delivery ? `entrega ${delivery}` : null,
            available ? `${available} viviendas disponibles` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          images: p.featured_media_url ? [p.featured_media_url] : [],
        });
      }
    }

    return [...bySlug.values()];
  },
};
