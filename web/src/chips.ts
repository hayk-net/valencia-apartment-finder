import type { Filters } from './types';

export interface Chip {
  key: string;
  label: string;
}

const euro = (n: number) => n.toLocaleString('es-ES') + ' €';

/** Human-readable, removable representation of the structured filters. */
export function filtersToChips(f: Filters): Chip[] {
  const chips: Chip[] = [];
  if (f.minRooms !== undefined && f.maxRooms !== undefined) {
    chips.push({
      key: 'rooms',
      label: f.minRooms === f.maxRooms ? `${f.minRooms} bed` : `${f.minRooms}–${f.maxRooms} bed`,
    });
  } else if (f.minRooms !== undefined) {
    chips.push({ key: 'rooms', label: `${f.minRooms}+ bed` });
  } else if (f.maxRooms !== undefined) {
    chips.push({ key: 'rooms', label: `≤ ${f.maxRooms} bed` });
  }
  if (f.minBathrooms !== undefined) chips.push({ key: 'baths', label: `${f.minBathrooms}+ bath` });
  if (f.minPrice !== undefined && f.maxPrice !== undefined) {
    chips.push({ key: 'price', label: `${euro(f.minPrice)} – ${euro(f.maxPrice)}` });
  } else if (f.maxPrice !== undefined) {
    chips.push({ key: 'price', label: `≤ ${euro(f.maxPrice)}` });
  } else if (f.minPrice !== undefined) {
    chips.push({ key: 'price', label: `≥ ${euro(f.minPrice)}` });
  }
  if (f.minSqm !== undefined && f.maxSqm !== undefined) {
    chips.push({ key: 'sqm', label: `${f.minSqm}–${f.maxSqm} m²` });
  } else if (f.minSqm !== undefined) {
    chips.push({ key: 'sqm', label: `≥ ${f.minSqm} m²` });
  } else if (f.maxSqm !== undefined) {
    chips.push({ key: 'sqm', label: `≤ ${f.maxSqm} m²` });
  }
  if (f.minFloor !== undefined) {
    chips.push({ key: 'floor', label: f.minFloor === 1 ? 'no ground floor' : `floor ≥ ${f.minFloor}` });
  }
  if (f.maxBuildingAgeYears !== undefined) {
    chips.push({ key: 'age', label: `≤ ${f.maxBuildingAgeYears} years old` });
  }
  if (f.minBuildingYear !== undefined) {
    chips.push({ key: 'yearmin', label: `built ≥ ${f.minBuildingYear}` });
  }
  if (f.mustHaveElevator) chips.push({ key: 'elevator', label: 'elevator' });
  if (f.newBuildOnly) chips.push({ key: 'newbuild', label: 'new build' });
  if (f.resaleOnly) chips.push({ key: 'resale', label: 'resale only' });
  if (f.topFloorOnly) chips.push({ key: 'topfloor', label: 'ático / top floor' });
  if (f.futureOnly) chips.push({ key: 'future', label: '🚧 sobre plano / en construcción' });
  for (const n of f.neighborhoods ?? []) chips.push({ key: `area:${n}`, label: n });
  for (const k of f.keywords ?? []) chips.push({ key: `kw:${k}`, label: k });
  if (f.sources && f.sources.length > 0) {
    chips.push({ key: 'sources', label: `source: ${f.sources.join(' + ')}` });
  }
  return chips;
}

/** Return a copy of filters with the chip's underlying fields removed. */
export function removeChip(f: Filters, key: string): Filters {
  const next: Filters = { ...f };
  if (key === 'rooms') {
    delete next.minRooms;
    delete next.maxRooms;
  } else if (key === 'baths') delete next.minBathrooms;
  else if (key === 'price') {
    delete next.minPrice;
    delete next.maxPrice;
  } else if (key === 'sqm') {
    delete next.minSqm;
    delete next.maxSqm;
  } else if (key === 'floor') delete next.minFloor;
  else if (key === 'age') delete next.maxBuildingAgeYears;
  else if (key === 'yearmin') delete next.minBuildingYear;
  else if (key === 'elevator') delete next.mustHaveElevator;
  else if (key === 'newbuild') delete next.newBuildOnly;
  else if (key === 'resale') delete next.resaleOnly;
  else if (key === 'topfloor') delete next.topFloorOnly;
  else if (key === 'future') delete next.futureOnly;
  else if (key === 'sources') delete next.sources;
  else if (key.startsWith('area:')) {
    next.neighborhoods = (next.neighborhoods ?? []).filter((n) => n !== key.slice(5));
    if (next.neighborhoods.length === 0) delete next.neighborhoods;
  } else if (key.startsWith('kw:')) {
    next.keywords = (next.keywords ?? []).filter((k) => k !== key.slice(3));
    if (next.keywords.length === 0) delete next.keywords;
  }
  return next;
}
