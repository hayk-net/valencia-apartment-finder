import { describe, expect, it } from 'vitest';
import { compareGems, heuristicGemScore, isValenciaCity } from '../src/ai/gemRank.js';
import type { Listing } from '../src/types.js';

function fake(over: Partial<Listing>): Listing {
  return {
    id: 1,
    source: 'test',
    sourceId: 't1',
    url: 'https://example.com',
    title: 'Piso en Russafa',
    propertyType: 'flat',
    isNewBuild: false,
    constructionStatus: null,
    delivery: null,
    price: 280_000,
    rooms: 3,
    bathrooms: 2,
    sqm: 100,
    floor: 4,
    isTopFloor: false,
    hasElevator: true,
    buildingYear: 1980,
    address: null,
    neighborhood: 'Russafa',
    municipality: 'Valencia',
    lat: null,
    lng: null,
    description: 'Bonito piso exterior con terraza',
    flags: [],
    images: [],
    firstSeenAt: '',
    lastSeenAt: '',
    isActive: true,
    favoritedAt: null,
    hiddenAt: null,
    units: null,
    valuePct: 0,
    ai: null,
    ...over,
  };
}

describe('heuristicGemScore — the owner definition of a gem', () => {
  it('sweet spot (~15% under area median, renovated, lift) ranks high', () => {
    const s = heuristicGemScore(
      fake({ valuePct: 15, description: 'Totalmente reformado, exterior, con ascensor y terraza' }),
    );
    expect(s).toBeGreaterThanOrEqual(75);
  });

  it('absurdly cheap occupied wreck ranks near the bottom', () => {
    const s = heuristicGemScore(
      fake({
        valuePct: 73,
        flags: ['ocupada'],
        description: 'Posible activo ocupado. Casa para reformar integralmente.',
      }),
    );
    expect(s).toBeLessThan(15);
  });

  it('huge discount even without flags is a warning, not a gem', () => {
    const cheapTrap = heuristicGemScore(fake({ valuePct: 60, description: 'Oportunidad inversores' }));
    const sweetSpot = heuristicGemScore(fake({ valuePct: 18 }));
    expect(cheapTrap).toBeLessThan(40);
    expect(sweetSpot).toBeGreaterThan(cheapTrap + 25);
  });

  it('"para reformar" sinks while "reformado" lifts', () => {
    const wreck = heuristicGemScore(fake({ valuePct: 10, description: 'Piso para reformar completamente' }));
    const done = heuristicGemScore(fake({ valuePct: 10, description: 'Piso recién reformado' }));
    expect(done - wreck).toBeGreaterThanOrEqual(30);
  });

  it('fair price + quality beats fair price + nothing', () => {
    const plain = heuristicGemScore(fake({ valuePct: 0, description: 'Piso en finca antigua', hasElevator: null, floor: null }));
    const nice = heuristicGemScore(
      fake({ valuePct: 0, description: 'Reformado, exterior y luminoso, con terraza' }),
    );
    expect(nice).toBeGreaterThan(plain + 10);
  });

  it('overpriced listings sink below fair ones', () => {
    expect(heuristicGemScore(fake({ valuePct: -25 }))).toBeLessThan(heuristicGemScore(fake({ valuePct: 0 })));
  });

  it('any source flag is a deal-breaker regardless of price appeal', () => {
    const flagged = heuristicGemScore(fake({ valuePct: 20, flags: ['nuda propiedad'] }));
    expect(flagged).toBeLessThan(35);
  });
});

describe('Valencia city priority (standing rule)', () => {
  it('recognizes the capital under its spellings', () => {
    expect(isValenciaCity(fake({ municipality: 'Valencia' }))).toBe(true);
    expect(isValenciaCity(fake({ municipality: 'València' }))).toBe(true);
    expect(isValenciaCity(fake({ municipality: 'Valencia Capital' }))).toBe(true);
    expect(isValenciaCity(fake({ municipality: 'Mislata' }))).toBe(false);
    expect(isValenciaCity(fake({ municipality: 'Burjassot' }))).toBe(false);
  });

  it('a modest city listing still ranks above a stellar province one', () => {
    const cityModest = { l: fake({ municipality: 'Valencia' }), score: 55 };
    const provinceStar = { l: fake({ municipality: 'Torrent' }), score: 92 };
    expect(compareGems(cityModest, provinceStar)).toBeLessThan(0); // city sorts first
  });

  it('within the same tier, score decides', () => {
    const a = { l: fake({ municipality: 'Valencia' }), score: 80 };
    const b = { l: fake({ municipality: 'Valencia' }), score: 60 };
    expect(compareGems(a, b)).toBeLessThan(0);
  });
});
