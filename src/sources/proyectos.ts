import * as cheerio from 'cheerio';
import type { Listing, ScrapedListing, SourceAdapter, UnitType } from '../types.js';
import { norm, parseEuro, politeFetch } from './helpers.js';

/**
 * Direct projects & cooperatives — one-off project websites that never appear
 * on portals (a cooperative can price ~15% under a traditional promotion).
 *
 * REGISTRY-DRIVEN: found a project site? Add one line here and it becomes a
 * tracked listing. The generic parser pulls typology prices ("2 dormitorios
 * desde 285.000 €"), unit specs, delivery year and status from the page text.
 */
const REGISTRY: {
  slug: string;
  url: string;
  name: string;
  neighborhood: string | null;
  municipality: string;
  cooperative?: boolean;
}[] = [
  {
    slug: 'residencial-desti',
    url: 'https://www.residencialdesti.com/',
    name: 'Residencial Destí',
    neighborhood: 'Patraix',
    municipality: 'Valencia',
    cooperative: true,
  },
];

export const proyectos: SourceAdapter = {
  name: 'proyectos',

  async fetch(): Promise<ScrapedListing[]> {
    const out: ScrapedListing[] = [];

    for (const project of REGISTRY) {
      let html: string;
      try {
        html = await politeFetch(project.url);
      } catch {
        continue;
      }
      const $ = cheerio.load(html);
      const text = $('body').text().replace(/\s+/g, ' ');
      const t = norm(text);

      // typologies: "1 dormitorio desde 213.000 €", "áticos desde 576.000 €"
      const units: UnitType[] = [];
      for (const m of t.matchAll(/(\d)\s*dormitorios?\s*desde\s*([\d.\s]{5,12})\s*€/g)) {
        const price = Number(m[2].replace(/[.\s]/g, ''));
        if (price >= 60000) units.push({ price, sold: false, rooms: Number(m[1]), baths: null, sqm: null, floor: null, type: null });
      }
      const atico = t.match(/aticos?\s*desde\s*([\d.\s]{5,12})\s*€/);
      if (atico) {
        const price = Number(atico[1].replace(/[.\s]/g, ''));
        if (price >= 60000) units.push({ price, sold: false, rooms: null, baths: null, sqm: null, floor: null, type: 'Ático' });
      }
      // unit spec blocks: "Dormitorios: 3 Baños: 3 Superficie: 160 m"
      for (const m of text.matchAll(/Dormitorios:\s*(\d)[^D]{0,40}?Baños:\s*(\d)[^D]{0,40}?Superficie:\s*(\d{2,3})/g)) {
        units.push({ price: null, sold: false, rooms: Number(m[1]), baths: Number(m[2]), sqm: Number(m[3]), floor: null, type: null });
      }

      const prices = units.map((u) => u.price).filter((p): p is number => p !== null);
      const priceAll = [...prices];
      const generic = parseEuro(text);
      if (generic && generic >= 60000) priceAll.push(generic);
      if (priceAll.length === 0) continue;

      const status: Listing['constructionStatus'] = /en construccion|en obra/.test(t)
        ? 'building'
        : 'planned';
      const deliveryM = t.match(/entrega[^.]{0,50}?(20\d{2})/);
      const roomsNums = units.map((u) => u.rooms).filter((r): r is number => r !== null);

      out.push({
        source: 'proyectos',
        sourceId: project.slug,
        url: project.url,
        title: `Obra nueva — ${project.name}${project.cooperative ? ' (cooperativa)' : ''}`,
        propertyType: 'new development',
        isNewBuild: true,
        constructionStatus: status,
        delivery: deliveryM ? deliveryM[1] : null,
        price: Math.min(...priceAll),
        rooms: roomsNums.length ? Math.max(...roomsNums) : null,
        bathrooms: null,
        sqm: units.map((u) => u.sqm).filter(Boolean).length
          ? Math.max(...units.map((u) => u.sqm ?? 0))
          : null,
        floor: null,
        isTopFloor: false,
        hasElevator: null,
        buildingYear: new Date().getFullYear(),
        address: null,
        neighborhood: project.neighborhood,
        municipality: project.municipality,
        lat: null,
        lng: null,
        description: [
          project.cooperative
            ? 'Régimen de COOPERATIVA (precio suele quedar por debajo de promoción tradicional)'
            : 'Proyecto directo del promotor',
          `estado: ${status === 'building' ? 'en construcción' : 'en proyecto / inscripciones'}`,
          $('meta[name="description"]').attr('content') ??
            $('meta[property="og:description"]').attr('content') ??
            null,
        ]
          .filter(Boolean)
          .join('. '),
        units: units.length ? units : undefined,
        images: $('meta[property="og:image"]').attr('content')
          ? [$('meta[property="og:image"]').attr('content')!]
          : [],
      });
    }

    return out;
  },
};
