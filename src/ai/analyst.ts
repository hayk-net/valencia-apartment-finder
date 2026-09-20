import '../env.js';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getDb, now } from '../db/index.js';
import { searchListings } from '../db/listings.js';
import type { Filters, Listing } from '../types.js';
import { computeBaselines, valuePct } from './baselines.js';

/**
 * The AI analyst: reads each listing (Spanish description included) against the
 * user's criteria and the area's price statistics, and scores how much of a
 * "gem" it is. Results are cached in ai_analysis and invalidated when the
 * listing's price or the user's criteria change.
 */

const MODEL = process.env.REALTOR_AI_MODEL ?? 'claude-opus-5';
const EFFORT = (process.env.REALTOR_AI_EFFORT ?? 'medium') as 'low' | 'medium' | 'high';
const BATCH_SIZE = 8;
const CONCURRENCY = 2;
const MAX_LISTINGS_PER_RUN = 200;

// $ per MTok — for the cost note shown after a run
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function aiStatus(): { configured: boolean; model: string; hint?: string } {
  const configured = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return configured
    ? { configured, model: MODEL }
    : {
        configured,
        model: MODEL,
        hint: 'Add ANTHROPIC_API_KEY to .env (console.anthropic.com → API keys), then restart npm run dev.',
      };
}

export function criteriaHash(filters: Filters, rawQuery: string): string {
  const stable = JSON.stringify({
    f: filters,
    q: rawQuery.trim().toLowerCase(),
    m: MODEL,
    p: PROMPT_VERSION,
  });
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

const ResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.number().describe('the listing id, copied exactly from the input'),
      score: z.number().min(0).max(100).describe('gem score: fit to criteria + value + quality'),
      verdict: z.string().describe('one short, concrete English sentence — the "why"'),
      pros: z.array(z.string()).max(3),
      cons: z.array(z.string()).max(3),
      redFlags: z
        .array(z.string())
        .describe('serious issues only: nuda propiedad, okupada, subasta, structural, illegal, etc.'),
    }),
  ),
});

const PROMPT_VERSION = 3; // bump to invalidate cached analyses when the rubric changes

const SYSTEM = `You are a veteran Valencia buyer's agent with 20 years in the local market, scoring apartment listings for a client who wants to BUY AND LIVE THERE. You read Spanish, Valencian and English listing texts natively.

THE CLIENT'S OWN DEFINITION OF A GEM (authoritative):
"What I am looking for, in my price range but cheaper than it should have been — or the same price as the others but this one is in a good area, or it has a renovation." The lowest-price listings are often the WORST of the worst (empty shells, occupied buildings); cheapest ≠ gem.

LOCATION PRIORITY (standing client rule): Valencia CITY (municipality "Valencia") always outranks the rest of the province — a listing in Mislata, Torrent, Burjassot, Bétera etc. must score noticeably lower on FIT than an otherwise-equal city listing. Province listings can still score decently, but never above a comparable city option.

Score each listing 0-100:
1. FIT first — a bargain that doesn't match the client's criteria is not their gem. Missing data (floor "?", year "?") is neutral, not disqualifying.
2. VALUE has a SWEET SPOT — pctBelowAreaMedian of roughly +5% to +30% is the credible "cheaper than it should be" zone. Beyond ~+40% below market, assume there is a catch and hunt for it in the text (nuda propiedad, ocupada/okupada, subasta, alquilado con inquilino, para reformar/ruina, bajo/interior, sin cédula, casa vs piso). An unexplained price anomaly is a WARNING, scored low — never a gem.
3. QUALITY at fair price also makes a gem — reformado/rehabilitado, finca rehabilitada, terraza/balcón (and size), exterior/luminoso, ascensor, good orientation, garage/trastero included, better barrio than the price implies.

The "flags" field contains DEAL-BREAKERS the portal itself reported (bare ownership, occupied, auction, sitting tenant) — any flagged listing scores 0-25 and the flag goes in redFlags.

Scoring bands: 85-100 exceptional gem (rare — fits, credibly underpriced or clearly better than peers, no catch), 70-84 strong candidate, 50-69 fair, 30-49 weak fit / overpriced / needs work, 0-25 trap or wreck (flagged, para reformar integral, price anomaly with a catch).
Red flags list: only real deal-breakers found in the data. Never invent facts. Verdicts: concrete and specific ("Reformed 4º exterior 14% under Russafa median with lift — real candidate"), never generic filler.
Return every listing you were given, same ids, no extras.`;

interface PendingListing extends Listing {
  valuePct: number | null;
}

export interface AnalyzeSummary {
  requested: number;
  analyzed: number;
  cached: number;
  failed: number;
  batches: number;
  model: string;
  costUsd: number | null;
  tookMs: number;
  error?: string;
}

function listingPayload(l: PendingListing) {
  return {
    id: l.id,
    price: l.price,
    eurPerSqm: l.sqm && l.sqm > 0 ? Math.round(l.price / l.sqm) : null,
    pctBelowAreaMedian: l.valuePct,
    rooms: l.rooms,
    bathrooms: l.bathrooms,
    sqm: l.sqm,
    floor: l.floor,
    isTopFloor: l.isTopFloor,
    buildingYear: l.buildingYear,
    hasElevator: l.hasElevator,
    isNewBuild: l.isNewBuild,
    propertyType: l.propertyType,
    flags: l.flags,
    availableUnits: l.units
      ?.filter((u) => !u.sold)
      .slice(0, 6)
      .map((u) => ({ price: u.price, rooms: u.rooms, sqm: u.sqm, floor: u.floor, type: u.type })),
    area: l.neighborhood ?? l.municipality,
    municipality: l.municipality,
    title: l.title,
    description: (l.description ?? '').slice(0, 700),
  };
}

async function analyzeBatch(
  batch: PendingListing[],
  criteria: { rawQuery: string; filters: Filters },
  hash: string,
): Promise<{ ok: number; usageIn: number; usageOut: number }> {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(ResultSchema), effort: EFFORT },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          clientCriteria: {
            searchText: criteria.rawQuery || '(none given — score on value and quality alone)',
            filters: criteria.filters,
          },
          listings: batch.map(listingPayload),
        }),
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error('model returned unparseable output');

  const db = getDb();
  const byId = new Map(batch.map((l) => [l.id, l]));
  const upsert = db.prepare(
    `INSERT INTO ai_analysis (listing_id, model, criteria_hash, analyzed_price, gem_score, verdict, pros_json, cons_json, red_flags_json, analyzed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(listing_id) DO UPDATE SET
       model = excluded.model, criteria_hash = excluded.criteria_hash,
       analyzed_price = excluded.analyzed_price, gem_score = excluded.gem_score,
       verdict = excluded.verdict, pros_json = excluded.pros_json,
       cons_json = excluded.cons_json, red_flags_json = excluded.red_flags_json,
       analyzed_at = excluded.analyzed_at`,
  );
  let ok = 0;
  for (const r of parsed.results) {
    const listing = byId.get(r.id);
    if (!listing) continue; // model invented an id — drop it
    upsert.run(
      listing.id,
      MODEL,
      hash,
      listing.price,
      Math.round(Math.min(100, Math.max(0, r.score))),
      r.verdict,
      JSON.stringify(r.pros.slice(0, 3)),
      JSON.stringify(r.cons.slice(0, 3)),
      JSON.stringify(r.redFlags),
      now(),
    );
    ok++;
  }
  return { ok, usageIn: response.usage.input_tokens, usageOut: response.usage.output_tokens };
}

export async function analyzeListings(filters: Filters, rawQuery: string): Promise<AnalyzeSummary> {
  const started = Date.now();
  const hash = criteriaHash(filters, rawQuery);
  const { items } = searchListings({ filters, limit: MAX_LISTINGS_PER_RUN });

  const baselines = computeBaselines();
  const withValue: PendingListing[] = items.map((l) => ({ ...l, valuePct: valuePct(baselines, l) }));
  const pending = withValue.filter(
    (l) => !l.ai || l.ai.criteriaHash !== hash || l.ai.analyzedPrice !== l.price,
  );

  const summary: AnalyzeSummary = {
    requested: items.length,
    analyzed: 0,
    cached: items.length - pending.length,
    failed: 0,
    batches: 0,
    model: MODEL,
    costUsd: null,
    tookMs: 0,
  };

  const batches: PendingListing[][] = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE));
  summary.batches = batches.length;

  let usageIn = 0;
  let usageOut = 0;
  let firstError: string | undefined;

  // small worker pool — CONCURRENCY batches in flight at a time
  let cursor = 0;
  const worker = async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      try {
        const r = await analyzeBatch(batch, { rawQuery, filters }, hash);
        summary.analyzed += r.ok;
        summary.failed += batch.length - r.ok;
        usageIn += r.usageIn;
        usageOut += r.usageOut;
      } catch (err) {
        summary.failed += batch.length;
        if (!firstError) {
          if (err instanceof Anthropic.AuthenticationError) {
            firstError = 'Invalid API key — check ANTHROPIC_API_KEY in .env';
          } else if (err instanceof Anthropic.RateLimitError) {
            firstError = 'Rate limited by the API — wait a minute and analyze again';
          } else if (err instanceof Anthropic.APIError) {
            firstError = `API error ${err.status}: ${err.message}`;
          } else {
            firstError = (err as Error).message;
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

  const pricing = PRICING[MODEL];
  if (pricing && usageIn + usageOut > 0) {
    summary.costUsd = Math.round((usageIn / 1e6) * pricing.in * 100 + (usageOut / 1e6) * pricing.out * 100) / 100;
  }
  summary.tookMs = Date.now() - started;
  if (firstError) summary.error = firstError;
  return summary;
}
