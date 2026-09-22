import { describe, expect, it } from 'vitest';
import { parseWithRules } from '../src/nl/rules.js';

describe('parseWithRules', () => {
  it('parses the original example sentence (typo included)', () => {
    const f = parseWithRules(
      'I am searching for 3 bedroom 2 bathroom, maximum 50 years old building, 100 sqm not more then 330K euros, and above 3rd floor only',
    );
    expect(f.minRooms).toBe(3);
    expect(f.minBathrooms).toBe(2);
    expect(f.maxBuildingAgeYears).toBe(50);
    expect(f.minSqm).toBe(100);
    expect(f.maxPrice).toBe(330_000);
    expect(f.minFloor).toBe(4); // "above 3rd" = 4th or higher
    expect(f.minPrice).toBeUndefined();
  });

  it('parses neighborhoods, elevator and bare k budget', () => {
    const f = parseWithRules('2 bed flat in Ruzafa or Benimaclet under €250,000 with elevator');
    expect(f.minRooms).toBe(2);
    expect(f.maxPrice).toBe(250_000);
    expect(f.mustHaveElevator).toBe(true);
    expect(f.neighborhoods).toEqual(['Russafa', 'Benimaclet']);
  });

  it('parses new build, min sqm, floor-or-higher and full euro amount', () => {
    const f = parseWithRules('new build, at least 90 m2, 3 bedrooms, up to €400.000, 5th floor or higher');
    expect(f.newBuildOnly).toBe(true);
    expect(f.minSqm).toBe(90);
    expect(f.minRooms).toBe(3);
    expect(f.maxPrice).toBe(400_000);
    expect(f.minFloor).toBe(5);
  });

  it('parses ranges and ground-floor exclusion', () => {
    const f = parseWithRules('80-120 sqm, 2 to 3 bedrooms, max 300000 euros, not ground floor, terrace');
    expect(f.minSqm).toBe(80);
    expect(f.maxSqm).toBe(120);
    expect(f.minRooms).toBe(2);
    expect(f.maxRooms).toBe(3);
    expect(f.maxPrice).toBe(300_000);
    expect(f.minFloor).toBe(1);
    expect(f.keywords).toContain('terrace');
  });

  it('parses price range and built-after year', () => {
    const f = parseWithRules('between 200k and 330k, built after 1990, 2 bathrooms, garage');
    expect(f.minPrice).toBe(200_000);
    expect(f.maxPrice).toBe(330_000);
    expect(f.minBuildingYear).toBe(1990);
    expect(f.minBathrooms).toBe(2);
    expect(f.keywords).toContain('garage');
  });

  it('does not confuse years-old with price or floor', () => {
    const f = parseWithRules('maximum 30 years old, above 2nd floor, 300k');
    expect(f.maxBuildingAgeYears).toBe(30);
    expect(f.minFloor).toBe(3);
    expect(f.maxPrice).toBe(300_000);
  });

  it('handles studio and municipality', () => {
    const f = parseWithRules('studio in Mislata under 150k');
    expect(f.minRooms).toBe(0);
    expect(f.maxRooms).toBe(0);
    expect(f.maxPrice).toBe(150_000);
    expect(f.neighborhoods).toEqual(['Mislata']);
  });

  it('never reads "not more than" as a minimum, even when criteria repeat', () => {
    const f = parseWithRules(
      '3 bed not more then 330K euros above 3rd floor — 3 bed not more then 330K euros above 3rd floor',
    );
    expect(f.maxPrice).toBe(330_000);
    expect(f.minPrice).toBeUndefined();
    expect(f.minFloor).toBe(4);
  });

  it('detects future / off-plan intent', () => {
    expect(parseWithRules('3 bed sobre plano under 300k').futureOnly).toBe(true);
    expect(parseWithRules('apartments still being built, max 280k euros').futureOnly).toBe(true);
    expect(parseWithRules('off-plan new build in Patraix').futureOnly).toBe(true);
    expect(parseWithRules('3 bed in Russafa').futureOnly).toBeUndefined();
  });

  it('filters by source name', () => {
    expect(parseWithRules('show only fotocasa listings').sources).toEqual(['fotocasa']);
    expect(parseWithRules('metrovacesa 3 bed under 350k').sources).toEqual(['metrovacesa']);
  });

  it('treats unrecognized plain text as a location search', () => {
    expect(parseWithRules('Carrer de Cullera').neighborhoods).toEqual(['Carrer de Cullera']);
    expect(parseWithRules('la creu del grau').neighborhoods).toEqual(['La Creu del Grau']); // now in dictionary
  });

  it('returns empty filters for chatter', () => {
    const f = parseWithRules('show me everything you have');
    expect(Object.keys(f)).toHaveLength(0);
  });
});
