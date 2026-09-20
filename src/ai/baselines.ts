import { getDb } from '../db/index.js';

/**
 * Statistical value layer — no API needed.
 *
 * For each area we compute the median €/m² of active listings; a listing's
 * `valuePct` is how far below (+) or above (−) its own area's typical price it
 * sits. This is the first gem signal: "priced 18% under the Russafa median".
 */

export interface Baselines {
  /** median €/m² keyed by lowercased area name */
  byArea: Map<string, { median: number; n: number }>;
  global: { median: number; n: number };
}

const MIN_SAMPLES = 6;

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function areaKey(neighborhood: string | null, municipality: string | null): string | null {
  const area = neighborhood?.trim() || municipality?.trim();
  return area ? area.toLowerCase() : null;
}

export function computeBaselines(): Baselines {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT neighborhood, municipality, price, sqm FROM listings
       WHERE is_active = 1 AND sqm > 20 AND price > 10000`,
    )
    .all() as { neighborhood: string | null; municipality: string | null; price: number; sqm: number }[];

  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const r of rows) {
    const pps = r.price / r.sqm;
    if (pps < 300 || pps > 15000) continue; // junk guard (bad sqm parses)
    all.push(pps);
    const key = areaKey(r.neighborhood, r.municipality);
    if (!key) continue;
    let arr = groups.get(key);
    if (!arr) groups.set(key, (arr = []));
    arr.push(pps);
  }

  const byArea = new Map<string, { median: number; n: number }>();
  for (const [key, arr] of groups) {
    if (arr.length >= MIN_SAMPLES) {
      arr.sort((a, b) => a - b);
      byArea.set(key, { median: median(arr), n: arr.length });
    }
  }
  all.sort((a, b) => a - b);
  return { byArea, global: { median: all.length ? median(all) : 0, n: all.length } };
}

/**
 * % below the area's median €/m² (positive = cheaper than typical).
 * Falls back to the city-wide median when the area has too few samples.
 */
export function valuePct(
  b: Baselines,
  l: { price: number; sqm: number | null; neighborhood: string | null; municipality: string | null },
): number | null {
  if (!l.sqm || l.sqm <= 20 || b.global.n < MIN_SAMPLES) return null;
  const pps = l.price / l.sqm;
  if (pps < 300 || pps > 15000) return null;
  const key = areaKey(l.neighborhood, l.municipality);
  const base = (key && b.byArea.get(key)?.median) || b.global.median;
  if (!base) return null;
  return Math.round((1 - pps / base) * 100);
}
