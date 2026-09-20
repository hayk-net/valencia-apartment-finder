import { getDb, now } from '../db/index.js';
import { deactivateMissing, upsertListing } from '../db/listings.js';
import { ficsa } from '../sources/ficsa.js';
import { fotocasa } from '../sources/fotocasa.js';
import { habitaclia } from '../sources/habitaclia.js';
import { metrovacesa } from '../sources/metrovacesa.js';
import { proyectos } from '../sources/proyectos.js';
import { thinkspain } from '../sources/thinkspain.js';
import { viviendasnuevas } from '../sources/viviendasnuevas.js';
import type { RefreshSummary, SourceAdapter } from '../types.js';
import { backfillFromStoredText, enrichFromDetailPages } from './enrich.js';

/** Registry of all live source adapters. New sources plug in here. */
export const ADAPTERS: Record<string, SourceAdapter> = {
  habitaclia,
  fotocasa,
  thinkspain,
  viviendasnuevas,
  metrovacesa,
  ficsa,
  proyectos,
};

/** Default number of detail pages fetched after each refresh to fill in floor/year. */
const DEFAULT_ENRICH_LIMIT = 20;

export async function refreshSource(
  name: string,
  opts: { full?: boolean; maxPages?: number; enrichLimit?: number } = {},
): Promise<RefreshSummary> {
  const adapter = ADAPTERS[name];
  if (!adapter) throw new Error(`Unknown source "${name}". Known: ${Object.keys(ADAPTERS).join(', ')}`);

  const db = getDb();
  const full = opts.full ?? false;
  const runId = Number(
    db
      .prepare('INSERT INTO refresh_runs (source, started_at, full_sweep) VALUES (?, ?, ?)')
      .run(name, now(), full ? 1 : 0).lastInsertRowid,
  );

  const summary: RefreshSummary = {
    source: name,
    found: 0,
    added: 0,
    updated: 0,
    priceChanges: 0,
    deactivated: 0,
    full,
    ok: false,
  };

  try {
    const listings = await adapter.fetch({ full, maxPages: opts.maxPages });
    summary.found = listings.length;
    const seenIds: number[] = [];
    for (const l of listings) {
      const r = upsertListing(l);
      seenIds.push(r.id);
      if (r.added) summary.added++;
      else summary.updated++;
      if (r.priceChanged) summary.priceChanges++;
    }
    // Only a completed full sweep is proof that unseen listings are gone —
    // and a sweep that saw under half of the currently-active inventory is
    // almost certainly a PARTIAL sweep (throttling, transient block), not a
    // market collapse. Deactivating on partial data once nuked 3,355 rows.
    if (full && listings.length > 0 && adapter.supportsFullSweep !== false) {
      const active = (
        db.prepare('SELECT COUNT(*) AS c FROM listings WHERE source = ? AND is_active = 1').get(name) as {
          c: number;
        }
      ).c;
      if (active > 100 && listings.length < active * 0.5) {
        summary.warning = `partial sweep suspected (saw ${listings.length} of ${active} active) — deactivation skipped`;
        console.error(`[${name}] ${summary.warning}`);
      } else {
        summary.deactivated = deactivateMissing(name, seenIds);
      }
    }
    summary.ok = true;

    // floor/year live in free text — re-extract from stored text (free), then
    // fetch a capped number of detail pages for listings still missing them
    if (name === 'habitaclia') {
      summary.backfilled = backfillFromStoredText(name);
      const enrichLimit = opts.enrichLimit ?? DEFAULT_ENRICH_LIMIT;
      if (enrichLimit > 0) summary.enriched = await enrichFromDetailPages(enrichLimit);
    }
  } catch (err) {
    summary.error = (err as Error).message;
  }

  db.prepare(
    'UPDATE refresh_runs SET finished_at = ?, found = ?, added = ?, updated = ?, price_changes = ?, deactivated = ?, ok = ? , error = ? WHERE id = ?',
  ).run(
    now(),
    summary.found,
    summary.added,
    summary.updated,
    summary.priceChanges,
    summary.deactivated,
    summary.ok ? 1 : 0,
    summary.error ?? null,
    runId,
  );
  return summary;
}

export async function refreshAll(
  opts: { full?: boolean; maxPages?: number; enrichLimit?: number } = {},
): Promise<RefreshSummary[]> {
  const out: RefreshSummary[] = [];
  for (const name of Object.keys(ADAPTERS)) {
    out.push(await refreshSource(name, opts));
  }
  return out;
}
