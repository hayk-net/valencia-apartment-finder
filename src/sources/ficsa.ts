import * as cheerio from 'cheerio';
import type { Listing, ScrapedListing, SourceAdapter } from '../types.js';
import { AREAS } from '../nl/vocab.js';
import { norm, politeFetch } from './helpers.js';

/**
 * FICSA — Valencia-local developer ("promotora"). List page has no prices;
 * each promo detail page states "RANGO DE PRECIOS Desde X€", surface, and —
 * gold for future projects — "ESTADO DE LA OBRA N%" (construction progress).
 */
const INDEX = 'https://ficsa.es/promociones-obra-nueva-en-valencia/';
const DETAIL_CAP = 15;

function findArea(text: string): string | null {
  const t = norm(text);
  for (const area of AREAS) {
    if (area.variants.some((v) => t.includes(norm(v)))) return area.name;
  }
  return null;
}

export const ficsa: SourceAdapter = {
  name: 'ficsa',

  async fetch(): Promise<ScrapedListing[]> {
    const indexHtml = await politeFetch(INDEX);
    // the index shows each promo with its barrio ("GAIA Malilla · VALÈNCIA") —
    // detail pages can't be trusted for area (their menu lists every promo)
    const slugArea = new Map<string, string>();
    for (const m of indexHtml.matchAll(/href="https:\/\/ficsa\.es\/promociones\/([a-z0-9-]+)\/"/g)) {
      const slug = m[1];
      if (slugArea.has(slug)) continue;
      const nearby = indexHtml
        .slice(m.index ?? 0, (m.index ?? 0) + 300)
        .replace(/<[^>]+>/g, ' ');
      const area = findArea(nearby);
      if (area) slugArea.set(slug, area);
    }
    const slugs = [...new Set([...indexHtml.matchAll(/href="https:\/\/ficsa\.es\/promociones\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))].slice(0, DETAIL_CAP);

    const out: ScrapedListing[] = [];
    for (const slug of slugs) {
      const url = `https://ficsa.es/promociones/${slug}/`;
      let html: string;
      try {
        html = await politeFetch(url);
      } catch {
        continue;
      }
      const $ = cheerio.load(html);
      const text = $('body').text().replace(/\s+/g, ' ');

      const priceM =
        text.match(/RANGO DE PRECIOS[^€\d]*Desde\s*([\d.\s]+)\s*€/i) ??
        text.match(/Desde\s*([\d.\s]{6,12})\s*€/);
      const price = priceM ? Number(priceM[1].replace(/[.\s]/g, '')) : 0;
      if (price < 60000) continue; // price on request

      const estadoM = text.match(/ESTADO DE LA OBRA\s*(\d{1,3})/i);
      const progress = estadoM ? Number(estadoM[1]) : null;
      const status: Listing['constructionStatus'] =
        progress === null ? 'planned' : progress >= 100 ? 'done' : progress > 0 ? 'building' : 'planned';

      const sqmM = text.match(/SUPERFICIE[^m]{0,40}?De\s*([\d.,]+)\s*m/i);
      const roomsM = text.match(/(\d)\s*(?:y|a|-)\s*(\d)\s*dormitorios/i) ?? text.match(/(\d)\s*dormitorios/i);
      const deliveryM = text.match(/entrega[^.]{0,50}?(20\d{2})/i);
      const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || slug;
      const img = $('meta[property="og:image"]').attr('content') ?? null;

      out.push({
        source: 'ficsa',
        sourceId: slug,
        url,
        title: `Obra nueva — ${name.replace(/\s*[|·-]\s*FICSA.*$/i, '')}`,
        propertyType: 'new development',
        isNewBuild: true,
        constructionStatus: status,
        delivery: deliveryM ? deliveryM[1] : null,
        price,
        rooms: roomsM ? Math.max(...roomsM.slice(1).filter(Boolean).map(Number)) : null,
        bathrooms: null,
        sqm: sqmM ? Math.round(parseFloat(sqmM[1].replace(',', '.'))) : null,
        floor: null,
        isTopFloor: false,
        hasElevator: null,
        buildingYear: new Date().getFullYear(),
        address: null,
        neighborhood: slugArea.get(slug) ?? null,
        municipality: 'Valencia',
        lat: null,
        lng: null,
        description: [
          `FICSA — obra nueva${progress !== null ? `, estado de la obra ${Math.min(progress, 100)}%` : ''}`,
          $('meta[name="description"]').attr('content') ?? null,
        ]
          .filter(Boolean)
          .join('. '),
        images: img ? [img] : [],
      });
    }
    return out;
  },
};
