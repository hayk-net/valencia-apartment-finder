import * as cheerio from 'cheerio';
import { getDb, now } from '../db/index.js';
import { elevatorFromText, extractFloor, isHouseText, politeFetch, yearFromText } from '../sources/helpers.js';

/**
 * Floor / year / elevator live in free text, not structured fields (the user's
 * observation: "people add the floor in the description"). Two passes fix it:
 *
 * 1. backfillFromStoredText — re-run the extractors over title+description we
 *    already have. Free, instant, no network.
 * 2. enrichFromDetailPages — list pages truncate descriptions, so fetch the
 *    detail page (politely) for listings still missing floor/year, store the
 *    FULL description, and extract again. Capped per run.
 */

interface Row {
  id: number;
  title: string;
  description: string | null;
  property_type: string | null;
  floor: number | null;
  is_top_floor: number;
  building_year: number | null;
  has_elevator: number | null;
  url: string;
}

function applyExtraction(r: Row, text: string): { changed: boolean; fields: FieldPatch } {
  const isHouse = (r.property_type ?? '').includes('house') || isHouseText(text);
  const { floor, topFloor } = extractFloor(text, isHouse);
  const year = yearFromText(text);
  const elevator = elevatorFromText(text);

  const fields: FieldPatch = {};
  if (r.floor === null && floor !== null) fields.floor = floor;
  if (!r.is_top_floor && topFloor) fields.is_top_floor = 1;
  if (r.building_year === null && year !== null) fields.building_year = year;
  if (r.has_elevator === null && elevator !== null) fields.has_elevator = elevator ? 1 : 0;
  if (isHouse && r.property_type !== 'house') fields.property_type = 'house';
  return { changed: Object.keys(fields).length > 0, fields };
}

type FieldPatch = Record<string, string | number | null>;

function updateRow(id: number, fields: FieldPatch): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  getDb()
    .prepare(`UPDATE listings SET ${sets} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
}

export function backfillFromStoredText(source = 'habitaclia'): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, description, property_type, floor, is_top_floor, building_year, has_elevator, url
       FROM listings WHERE source = ? AND is_active = 1`,
    )
    .all(source) as Row[];
  let updated = 0;
  for (const r of rows) {
    const { changed, fields } = applyExtraction(r, `${r.title} ${r.description ?? ''}`);
    if (changed) {
      updateRow(r.id, fields);
      updated++;
    }
  }
  return updated;
}

export interface EnrichSummary {
  fetched: number;
  updated: number;
  failed: number;
}

/** Fetch detail pages for habitaclia listings still missing floor or year. */
export async function enrichFromDetailPages(limit: number): Promise<EnrichSummary> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, description, property_type, floor, is_top_floor, building_year, has_elevator, url
       FROM listings
       WHERE source = 'habitaclia' AND is_active = 1 AND enriched_at IS NULL
         AND property_type != 'house'
         AND (floor IS NULL AND is_top_floor = 0 OR building_year IS NULL)
       ORDER BY (floor IS NULL AND is_top_floor = 0) DESC, first_seen_at DESC
       LIMIT ?`,
    )
    .all(limit) as Row[];

  const summary: EnrichSummary = { fetched: 0, updated: 0, failed: 0 };
  for (const r of rows) {
    try {
      const html = await politeFetch(r.url);
      const $ = cheerio.load(html);
      const fullDescription = $('#js-detail-description').text().replace(/\s+/g, ' ').trim();
      summary.fetched++;

      const text = `${r.title} ${fullDescription || r.description || ''}`;
      const { changed, fields } = applyExtraction(r, text);
      const patch: FieldPatch = { ...fields, enriched_at: now() };
      // keep the full description — better for the AI analyst too
      if (fullDescription && fullDescription.length > (r.description?.length ?? 0)) {
        patch.description = fullDescription;
      }
      updateRow(r.id, patch);
      if (changed) summary.updated++;
    } catch (err) {
      summary.failed++;
      // mark as attempted so one broken page doesn't get re-fetched forever
      updateRow(r.id, { enriched_at: now() });
      console.error(`[enrich] ${r.url}: ${(err as Error).message}`);
    }
  }
  return summary;
}
