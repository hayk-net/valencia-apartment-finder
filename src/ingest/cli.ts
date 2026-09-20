/**
 * Refresh listings from the command line.
 *
 *   npm run refresh                          # incremental, all sources (+20 detail-page enrichments)
 *   npm run refresh -- --source=habitaclia   # one source
 *   npm run refresh -- --full                # full sweep (slow, marks vanished listings inactive)
 *   npm run refresh -- --pages=3 --dry-run   # parse only, print, write nothing
 *   npm run refresh -- --enrich=100          # refresh, then enrich up to 100 detail pages
 *   npm run refresh -- --enrich-only=100     # skip refresh; just backfill + enrich floor/year data
 */
import { backfillFromStoredText, enrichFromDetailPages } from './enrich.js';
import { ADAPTERS, refreshAll, refreshSource } from './run.js';

const args = new Map<string, string>();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([\w-]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] ?? 'true');
}

const source = args.get('source');
const full = args.get('full') === 'true';
const dryRun = args.get('dry-run') === 'true' || args.get('dryRun') === 'true';
const maxPages = args.has('pages') ? Number(args.get('pages')) : undefined;
const enrichLimit = args.has('enrich') ? Number(args.get('enrich')) : undefined;

if (args.has('enrich-only')) {
  const limit = Number(args.get('enrich-only')) || 50;
  const backfilled = backfillFromStoredText();
  console.log(`backfilled ${backfilled} listings from stored text`);
  const e = await enrichFromDetailPages(limit);
  console.log(`enriched from detail pages: fetched ${e.fetched}, updated ${e.updated}, failed ${e.failed}`);
  process.exit(0);
}

if (dryRun) {
  const name = source ?? Object.keys(ADAPTERS)[0];
  const adapter = ADAPTERS[name];
  if (!adapter) {
    console.error(`Unknown source "${name}". Known: ${Object.keys(ADAPTERS).join(', ')}`);
    process.exit(1);
  }
  console.log(`[dry-run] fetching ${name} (${maxPages ?? 'default'} pages)…`);
  const listings = await adapter.fetch({ full, maxPages });
  for (const l of listings.slice(0, 10)) {
    console.log(
      `  ${l.price.toLocaleString('es-ES')}€ | ${l.rooms ?? '?'}hab ${l.bathrooms ?? '?'}baños ${l.sqm ?? '?'}m² ` +
        `floor:${l.floor ?? '?'} year:${l.buildingYear ?? '?'} lift:${l.hasElevator ?? '?'} | ` +
        `${l.neighborhood ?? l.municipality ?? ''} | ${l.title.slice(0, 60)}`,
    );
  }
  console.log(`[dry-run] parsed ${listings.length} listings — nothing written`);
} else {
  const opts = { full, maxPages, enrichLimit };
  const summaries = source ? [await refreshSource(source, opts)] : await refreshAll(opts);
  for (const s of summaries) {
    const status = s.ok ? (s.warning ? `ok, ⚠ ${s.warning}` : 'ok') : `FAILED: ${s.error}`;
    const enrich = s.enriched ? `, enriched ${s.enriched.updated}/${s.enriched.fetched} details` : '';
    const backfill = s.backfilled !== undefined ? `, ${s.backfilled} backfilled` : '';
    console.log(
      `${s.source}: found ${s.found}, +${s.added} new, ${s.updated} updated, ` +
        `${s.priceChanges} price changes, ${s.deactivated} deactivated${backfill}${enrich} [${status}]`,
    );
  }
  process.exit(summaries.every((s) => s.ok) ? 0 : 1);
}
