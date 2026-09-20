/**
 * Sample data so the UI has something to show before real sources are wired.
 *   npm run seed            # insert/update ~24 sample listings
 *   npm run seed -- --clear # remove them
 */
import { getDb } from '../db/index.js';
import { upsertListing } from '../db/listings.js';
import type { ScrapedListing } from '../types.js';

if (process.argv.includes('--clear')) {
  const n = getDb().prepare("DELETE FROM listings WHERE source = 'seed'").run().changes;
  console.log(`removed ${n} seed listings`);
  process.exit(0);
}

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

const SPECS: Array<Partial<ScrapedListing> & { neighborhood: string; municipality: string }> = [
  { neighborhood: 'Russafa', municipality: 'Valencia', price: 285000, rooms: 3, bathrooms: 2, sqm: 105, floor: 4, buildingYear: 1975, hasElevator: true },
  { neighborhood: 'Russafa', municipality: 'Valencia', price: 342000, rooms: 3, bathrooms: 2, sqm: 118, floor: 2, buildingYear: 1968, hasElevator: true },
  { neighborhood: 'El Carmen', municipality: 'Valencia', price: 265000, rooms: 2, bathrooms: 1, sqm: 88, floor: 1, buildingYear: 1930, hasElevator: false },
  { neighborhood: 'Benimaclet', municipality: 'Valencia', price: 219000, rooms: 3, bathrooms: 1, sqm: 95, floor: 5, buildingYear: 1985, hasElevator: true },
  { neighborhood: 'Benimaclet', municipality: 'Valencia', price: 199000, rooms: 2, bathrooms: 1, sqm: 78, floor: 3, buildingYear: 1990, hasElevator: null },
  { neighborhood: 'El Cabanyal', municipality: 'Valencia', price: 240000, rooms: 3, bathrooms: 2, sqm: 102, floor: 0, buildingYear: 1920, hasElevator: false },
  { neighborhood: 'La Malvarrosa', municipality: 'Valencia', price: 275000, rooms: 3, bathrooms: 2, sqm: 110, floor: 6, buildingYear: 2003, hasElevator: true },
  { neighborhood: 'Campanar', municipality: 'Valencia', price: 310000, rooms: 3, bathrooms: 2, sqm: 112, floor: 7, buildingYear: 1999, hasElevator: true },
  { neighborhood: 'Patraix', municipality: 'Valencia', price: 189000, rooms: 3, bathrooms: 1, sqm: 92, floor: 2, buildingYear: 1978, hasElevator: true },
  { neighborhood: 'Mestalla', municipality: 'Valencia', price: 365000, rooms: 4, bathrooms: 2, sqm: 135, floor: 8, buildingYear: 1995, hasElevator: true },
  { neighborhood: 'Aiora', municipality: 'Valencia', price: 232000, rooms: 3, bathrooms: 2, sqm: 98, floor: 4, buildingYear: 1988, hasElevator: true },
  { neighborhood: 'Malilla', municipality: 'Valencia', price: 295000, rooms: 3, bathrooms: 2, sqm: 106, floor: 9, buildingYear: 2020, hasElevator: true, isNewBuild: true },
  { neighborhood: 'Quatre Carreres', municipality: 'Valencia', price: 328000, rooms: 3, bathrooms: 2, sqm: 104, floor: null, buildingYear: 2026, hasElevator: true, isNewBuild: true, title: 'Obra nueva — Residencial Túria Sky, 3 dormitorios' },
  { neighborhood: 'Penya-roja', municipality: 'Valencia', price: 410000, rooms: 3, bathrooms: 2, sqm: 125, floor: 11, buildingYear: 2005, hasElevator: true },
  { neighborhood: 'Gran Vía', municipality: 'Valencia', price: 480000, rooms: 4, bathrooms: 3, sqm: 160, floor: 5, buildingYear: 1955, hasElevator: true },
  { neighborhood: 'Nou Moles', municipality: 'Valencia', price: 178000, rooms: 3, bathrooms: 1, sqm: 85, floor: 1, buildingYear: 1972, hasElevator: false },
  { neighborhood: 'Benicalap', municipality: 'Valencia', price: 265000, rooms: 3, bathrooms: 2, sqm: 100, floor: null, buildingYear: 2025, hasElevator: true, isNewBuild: true, title: 'Obra nueva — Benicalap Parc, entrega 2026' },
  { neighborhood: 'La Saïdia', municipality: 'Valencia', price: 210000, rooms: 3, bathrooms: 1, sqm: 94, floor: 3, buildingYear: null, hasElevator: true },
  { neighborhood: 'Orriols', municipality: 'Valencia', price: 155000, rooms: 3, bathrooms: 1, sqm: 88, floor: 4, buildingYear: 1970, hasElevator: false },
  { neighborhood: 'Montolivet', municipality: 'Valencia', price: 289000, rooms: 3, bathrooms: 2, sqm: 108, floor: 5, buildingYear: 1992, hasElevator: true },
  { neighborhood: null as unknown as string, municipality: 'Mislata', price: 205000, rooms: 3, bathrooms: 2, sqm: 101, floor: 4, buildingYear: 2008, hasElevator: true },
  { neighborhood: null as unknown as string, municipality: 'Alboraya', price: 245000, rooms: 3, bathrooms: 2, sqm: 99, floor: 2, buildingYear: 2010, hasElevator: true },
  { neighborhood: null as unknown as string, municipality: 'Burjassot', price: 238000, rooms: 3, bathrooms: 2, sqm: 103, floor: null, buildingYear: 2026, hasElevator: true, isNewBuild: true, title: 'Obra nueva — AQ The One Burjassot' },
  { neighborhood: null as unknown as string, municipality: 'Torrent', price: 172000, rooms: 3, bathrooms: 2, sqm: 97, floor: 6, buildingYear: 2004, hasElevator: true },
];

let i = 0;
let added = 0;
for (const spec of SPECS) {
  i++;
  const title =
    spec.title ??
    `Piso de ${spec.rooms} habitaciones en ${spec.neighborhood ?? spec.municipality}${spec.floor ? `, planta ${spec.floor}` : ''}`;
  const listing: ScrapedListing = {
    source: 'seed',
    sourceId: `seed-${i}`,
    url: `https://example.com/seed/${i}`,
    title,
    propertyType: 'flat',
    isNewBuild: spec.isNewBuild ?? false,
    constructionStatus: null,
    delivery: null,
    price: spec.price!,
    rooms: spec.rooms ?? null,
    bathrooms: spec.bathrooms ?? null,
    sqm: spec.sqm ?? null,
    floor: spec.floor === undefined ? null : spec.floor,
    isTopFloor: false,
    hasElevator: spec.hasElevator === undefined ? null : spec.hasElevator,
    buildingYear: spec.buildingYear === undefined ? null : spec.buildingYear,
    address: null,
    neighborhood: spec.neighborhood ?? null,
    municipality: spec.municipality,
    lat: null,
    lng: null,
    description: `${title}. Ejemplo de anuncio (datos de muestra). Luminoso, ${spec.sqm} m², ${
      spec.hasElevator ? 'con ascensor' : spec.hasElevator === false ? 'sin ascensor' : ''
    }.`,
    images: [],
  };
  if (upsertListing(listing).added) added++;
}
console.log(`seeded ${SPECS.length} sample listings (${added} new). Remove later with: npm run seed -- --clear`);
