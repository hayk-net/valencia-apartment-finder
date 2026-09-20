import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// point the DB at a throwaway file BEFORE importing anything that opens it
process.env.REALTOR_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'realtor-test-'));
process.env.REALTOR_DB = path.join(process.env.REALTOR_DATA_DIR, 'test.db');

const { upsertListing } = await import('../src/db/listings.js');
const { computeBaselines, valuePct } = await import('../src/ai/baselines.js');
const { criteriaHash } = await import('../src/ai/analyst.js');

function fakeListing(i: number, neighborhood: string, price: number, sqm: number) {
  return {
    source: 'test',
    sourceId: `t-${i}`,
    url: `https://example.com/${i}`,
    title: `Piso ${i}`,
    propertyType: 'flat',
    isNewBuild: false,
    constructionStatus: null,
    delivery: null,
    price,
    rooms: 3,
    bathrooms: 2,
    sqm,
    floor: 2,
    isTopFloor: false,
    hasElevator: true,
    buildingYear: null,
    address: null,
    neighborhood,
    municipality: 'Valencia',
    lat: null,
    lng: null,
    description: null,
    images: [],
  };
}

describe('baselines', () => {
  beforeAll(() => {
    // Russafa: 6 listings at exactly 3000 €/m², one outlier-free market
    for (let i = 1; i <= 6; i++) upsertListing(fakeListing(i, 'Russafa', 300_000, 100));
    // Benimaclet: only 2 listings → too few samples, falls back to global
    upsertListing(fakeListing(7, 'Benimaclet', 200_000, 100));
    upsertListing(fakeListing(8, 'Benimaclet', 220_000, 100));
  });

  it('computes the area median €/m² when samples suffice', () => {
    const b = computeBaselines();
    expect(b.byArea.get('russafa')?.median).toBe(3000);
    expect(b.byArea.get('russafa')?.n).toBe(6);
    expect(b.byArea.has('benimaclet')).toBe(false); // below MIN_SAMPLES
  });

  it('scores a listing 20% under its area median as +20', () => {
    const b = computeBaselines();
    const pct = valuePct(b, { price: 240_000, sqm: 100, neighborhood: 'Russafa', municipality: 'Valencia' });
    expect(pct).toBe(20);
  });

  it('returns null without sqm', () => {
    const b = computeBaselines();
    expect(valuePct(b, { price: 240_000, sqm: null, neighborhood: 'Russafa', municipality: 'Valencia' })).toBeNull();
  });
});

describe('criteriaHash', () => {
  it('is stable for identical criteria and changes when criteria change', () => {
    const a = criteriaHash({ maxPrice: 330_000 }, 'query');
    expect(criteriaHash({ maxPrice: 330_000 }, 'QUERY  ')).toBe(a); // trim+lowercase
    expect(criteriaHash({ maxPrice: 300_000 }, 'query')).not.toBe(a);
  });
});
