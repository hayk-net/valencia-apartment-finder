import { getDb, now } from './index.js';
import { computeBaselines, valuePct } from '../ai/baselines.js';
import { compareGems, heuristicGemScore } from '../ai/gemRank.js';
import { expandArea, expandFeature } from '../nl/vocab.js';
import type { Filters, Listing, PricePoint, ScrapedListing, SearchRequest } from '../types.js';

interface ListingRow {
  id: number;
  source: string;
  source_id: string;
  url: string;
  title: string;
  property_type: string | null;
  is_new_build: number;
  price: number;
  rooms: number | null;
  bathrooms: number | null;
  sqm: number | null;
  floor: number | null;
  is_top_floor: number;
  has_elevator: number | null;
  building_year: number | null;
  construction_status: string | null;
  delivery: string | null;
  address: string | null;
  neighborhood: string | null;
  municipality: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  flags_json: string;
  images_json: string;
  first_seen_at: string;
  last_seen_at: string;
  is_active: number;
  favorited_at: string | null;
  hidden_at: string | null;
  units_json: string | null;
  // from LEFT JOIN ai_analysis
  ai_score?: number | null;
  ai_verdict?: string | null;
  ai_pros?: string | null;
  ai_cons?: string | null;
  ai_flags?: string | null;
  ai_model?: string | null;
  ai_hash?: string | null;
  ai_price?: number | null;
  ai_at?: string | null;
}

function rowToListing(r: ListingRow): Listing {
  return {
    id: r.id,
    source: r.source,
    sourceId: r.source_id,
    url: r.url,
    title: r.title,
    propertyType: r.property_type,
    isNewBuild: !!r.is_new_build,
    price: r.price,
    rooms: r.rooms,
    bathrooms: r.bathrooms,
    sqm: r.sqm,
    floor: r.floor,
    isTopFloor: !!r.is_top_floor,
    hasElevator: r.has_elevator === null ? null : !!r.has_elevator,
    buildingYear: r.building_year,
    constructionStatus: (r.construction_status as Listing['constructionStatus']) ?? null,
    delivery: r.delivery ?? null,
    address: r.address,
    neighborhood: r.neighborhood,
    municipality: r.municipality,
    lat: r.lat,
    lng: r.lng,
    description: r.description,
    flags: JSON.parse(r.flags_json ?? '[]'),
    images: JSON.parse(r.images_json),
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    isActive: !!r.is_active,
    favoritedAt: r.favorited_at ?? null,
    hiddenAt: r.hidden_at ?? null,
    units: r.units_json ? JSON.parse(r.units_json) : null,
    ai:
      r.ai_score === null || r.ai_score === undefined
        ? null
        : {
            score: r.ai_score,
            verdict: r.ai_verdict ?? '',
            pros: JSON.parse(r.ai_pros ?? '[]'),
            cons: JSON.parse(r.ai_cons ?? '[]'),
            redFlags: JSON.parse(r.ai_flags ?? '[]'),
            model: r.ai_model ?? '',
            criteriaHash: r.ai_hash ?? '',
            analyzedPrice: r.ai_price ?? 0,
            analyzedAt: r.ai_at ?? '',
          },
  };
}

export interface UpsertResult {
  added: boolean;
  priceChanged: boolean;
  id: number;
}

export function upsertListing(l: ScrapedListing): UpsertResult {
  const db = getDb();
  const ts = now();
  const existing = db
    .prepare('SELECT id, price FROM listings WHERE source = ? AND source_id = ?')
    .get(l.source, l.sourceId) as { id: number; price: number } | undefined;

  if (!existing) {
    const info = db
      .prepare(
        `INSERT INTO listings (
          source, source_id, url, title, property_type, is_new_build, price,
          rooms, bathrooms, sqm, floor, is_top_floor, has_elevator, building_year,
          construction_status, delivery,
          address, neighborhood, municipality, lat, lng, description,
          flags_json, units_json, images_json, raw_json, first_seen_at, last_seen_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        l.source,
        l.sourceId,
        l.url,
        l.title,
        l.propertyType,
        l.isNewBuild ? 1 : 0,
        l.price,
        l.rooms,
        l.bathrooms,
        l.sqm,
        l.floor,
        l.isTopFloor ? 1 : 0,
        l.hasElevator === null ? null : l.hasElevator ? 1 : 0,
        l.buildingYear,
        l.constructionStatus,
        l.delivery,
        l.address,
        l.neighborhood,
        l.municipality,
        l.lat,
        l.lng,
        l.description,
        JSON.stringify(l.flags ?? []),
        l.units ? JSON.stringify(l.units) : null,
        JSON.stringify(l.images ?? []),
        l.raw === undefined ? null : JSON.stringify(l.raw),
        ts,
        ts,
      );
    const id = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO price_history (listing_id, price, seen_at) VALUES (?, ?, ?)').run(id, l.price, ts);
    return { added: true, priceChanged: false, id };
  }

  const priceChanged = existing.price !== l.price;
  db.prepare(
    `UPDATE listings SET
      url = ?, title = ?, property_type = ?, is_new_build = ?, price = ?,
      rooms = COALESCE(?, rooms), bathrooms = COALESCE(?, bathrooms), sqm = COALESCE(?, sqm),
      floor = COALESCE(?, floor), is_top_floor = MAX(is_top_floor, ?), has_elevator = COALESCE(?, has_elevator),
      building_year = COALESCE(?, building_year),
      construction_status = COALESCE(?, construction_status), delivery = COALESCE(?, delivery),
      address = COALESCE(?, address), neighborhood = COALESCE(?, neighborhood),
      municipality = COALESCE(?, municipality), lat = COALESCE(?, lat), lng = COALESCE(?, lng),
      description = COALESCE(?, description),
      flags_json = ?,
      units_json = COALESCE(?, units_json),
      images_json = CASE WHEN ? = '[]' THEN images_json ELSE ? END,
      last_seen_at = ?, is_active = 1
    WHERE id = ?`,
  ).run(
    l.url,
    l.title,
    l.propertyType,
    l.isNewBuild ? 1 : 0,
    l.price,
    l.rooms,
    l.bathrooms,
    l.sqm,
    l.floor,
    l.isTopFloor ? 1 : 0,
    l.hasElevator === null ? null : l.hasElevator ? 1 : 0,
    l.buildingYear,
    l.constructionStatus,
    l.delivery,
    l.address,
    l.neighborhood,
    l.municipality,
    l.lat,
    l.lng,
    l.description,
    JSON.stringify(l.flags ?? []),
    l.units ? JSON.stringify(l.units) : null,
    JSON.stringify(l.images ?? []),
    JSON.stringify(l.images ?? []),
    ts,
    existing.id,
  );
  if (priceChanged) {
    db.prepare('INSERT INTO price_history (listing_id, price, seen_at) VALUES (?, ?, ?)').run(
      existing.id,
      l.price,
      ts,
    );
  }
  return { added: false, priceChanged, id: existing.id };
}

/** Mark listings of a source inactive when a FULL sweep no longer sees them. */
export function deactivateMissing(source: string, seenIds: number[]): number {
  const db = getDb();
  if (seenIds.length === 0) return 0;
  const placeholders = seenIds.map(() => '?').join(',');
  const info = db
    .prepare(
      `UPDATE listings SET is_active = 0 WHERE source = ? AND is_active = 1 AND id NOT IN (${placeholders})`,
    )
    .run(source, ...seenIds);
  return info.changes;
}

export function buildWhere(f: Filters): { where: string; params: unknown[] } {
  // favorites/hidden views keep deactivated listings visible ("GONE" badge) —
  // knowing a candidate vanished from the portal is information, not noise
  const clauses: string[] = f.onlyFavorites
    ? ['favorited_at IS NOT NULL']
    : f.onlyHidden
      ? ['hidden_at IS NOT NULL']
      : ['is_active = 1', 'hidden_at IS NULL'];
  const params: unknown[] = [];
  if (f.resaleOnly) clauses.push('is_new_build = 0');
  if (f.topFloorOnly) {
    clauses.push("(is_top_floor = 1 OR lower(property_type) IN ('penthouse', 'ático', 'atico'))");
  }
  if (f.futureOnly) {
    clauses.push("construction_status IN ('planned', 'building')");
  }
  const inclFloor = f.includeUnknownFloor !== false;
  const inclYear = f.includeUnknownYear !== false;

  if (f.minRooms !== undefined) {
    clauses.push('rooms >= ?');
    params.push(f.minRooms);
  }
  if (f.maxRooms !== undefined) {
    clauses.push('rooms <= ?');
    params.push(f.maxRooms);
  }
  if (f.minBathrooms !== undefined) {
    clauses.push('bathrooms >= ?');
    params.push(f.minBathrooms);
  }
  if (f.minPrice !== undefined) {
    clauses.push('price >= ?');
    params.push(f.minPrice);
  }
  if (f.maxPrice !== undefined) {
    clauses.push('price <= ?');
    params.push(f.maxPrice);
  }
  if (f.minSqm !== undefined) {
    clauses.push('sqm >= ?');
    params.push(f.minSqm);
  }
  if (f.maxSqm !== undefined) {
    clauses.push('sqm <= ?');
    params.push(f.maxSqm);
  }
  if (f.minFloor !== undefined) {
    // an ático ("is_top_floor") satisfies any minimum floor even when the
    // exact number is unknown; houses NEVER do — they have no floor at all
    clauses.push(
      inclFloor
        ? "(floor >= ? OR is_top_floor = 1 OR (floor IS NULL AND property_type != 'house'))"
        : '(floor >= ? OR is_top_floor = 1)',
    );
    params.push(f.minFloor);
  }
  const minYearCandidates: number[] = [];
  if (f.maxBuildingAgeYears !== undefined) {
    minYearCandidates.push(new Date().getFullYear() - f.maxBuildingAgeYears);
  }
  if (f.minBuildingYear !== undefined) {
    minYearCandidates.push(f.minBuildingYear);
  }
  if (minYearCandidates.length > 0) {
    const minYear = Math.max(...minYearCandidates);
    clauses.push(inclYear ? '(building_year >= ? OR building_year IS NULL)' : 'building_year >= ?');
    params.push(minYear);
  }
  if (f.mustHaveElevator) {
    // elevator info is missing on many sources; unknown counts as "maybe" and stays visible
    clauses.push('(has_elevator = 1 OR has_elevator IS NULL)');
  }
  if (f.newBuildOnly) {
    clauses.push('is_new_build = 1');
  }
  if (f.neighborhoods && f.neighborhoods.length > 0) {
    // any area matches (OR); each area matches under any spelling variant
    const AREA_TEXT = `lower(coalesce(neighborhood,'') || ' ' || coalesce(municipality,'') || ' ' || coalesce(address,'') || ' ' || title)`;
    const perArea: string[] = [];
    for (const n of f.neighborhoods) {
      const variants = expandArea(n);
      perArea.push(`(${variants.map(() => `${AREA_TEXT} LIKE ?`).join(' OR ')})`);
      for (const v of variants) params.push(`%${v}%`);
    }
    clauses.push(`(${perArea.join(' OR ')})`);
  }
  if (f.keywords && f.keywords.length > 0) {
    // all features required (AND); each matches under any language variant
    const KW_TEXT = `lower(title || ' ' || coalesce(description,''))`;
    for (const kw of f.keywords) {
      const variants = expandFeature(kw);
      clauses.push(`(${variants.map(() => `${KW_TEXT} LIKE ?`).join(' OR ')})`);
      for (const v of variants) params.push(`%${v}%`);
    }
  }
  if (f.sources && f.sources.length > 0) {
    clauses.push(`source IN (${f.sources.map(() => '?').join(',')})`);
    params.push(...f.sources);
  }
  return { where: clauses.join(' AND '), params };
}

const SORTS: Record<string, string> = {
  gem: '(a.gem_score IS NULL) ASC, a.gem_score DESC, CASE WHEN l.sqm > 0 THEN l.price / l.sqm ELSE 1e12 END ASC',
  newest: 'l.first_seen_at DESC, l.id DESC',
  price_asc: 'l.price ASC',
  price_desc: 'l.price DESC',
  sqm_desc: 'l.sqm DESC NULLS LAST',
  eur_per_sqm: 'CASE WHEN l.sqm > 0 THEN l.price / l.sqm ELSE 1e12 END ASC',
};

const AI_SELECT = `l.*, a.gem_score AS ai_score, a.verdict AS ai_verdict, a.pros_json AS ai_pros,
  a.cons_json AS ai_cons, a.red_flags_json AS ai_flags, a.model AS ai_model,
  a.criteria_hash AS ai_hash, a.analyzed_price AS ai_price, a.analyzed_at AS ai_at`;

export function searchListings(req: SearchRequest): { items: Listing[]; total: number } {
  const db = getDb();
  const { where, params } = buildWhere(req.filters ?? {});
  const limit = Math.min(req.limit ?? 60, req.compact ? 1200 : 200);
  const offset = req.offset ?? 0;
  const baselines = computeBaselines();
  const finish = (items: Listing[], total: number) => {
    if (req.compact) for (const l of items) l.description = null;
    else attachPriceDrops(items);
    return { items, total };
  };

  // "Gems first" is a computed ranking (AI score, else the value/quality
  // heuristic) — rank the whole matching set in JS, then paginate
  if ((req.sort ?? 'newest') === 'gem') {
    const rows = db
      .prepare(
        `SELECT ${AI_SELECT} FROM listings l LEFT JOIN ai_analysis a ON a.listing_id = l.id WHERE ${where}`,
      )
      .all(...params) as ListingRow[];
    const scored = rows.map((r) => {
      const l = rowToListing(r);
      l.valuePct = valuePct(baselines, l);
      return { l, score: l.ai ? l.ai.score : heuristicGemScore(l) };
    });
    scored.sort(compareGems);
    return finish(scored.slice(offset, offset + limit).map((x) => x.l), scored.length);
  }

  const orderBy = SORTS[req.sort ?? 'newest'] ?? SORTS.newest;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT ${AI_SELECT} FROM listings l LEFT JOIN ai_analysis a ON a.listing_id = l.id
       WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ListingRow[];

  const items = rows.map((r) => {
    const l = rowToListing(r);
    l.valuePct = valuePct(baselines, l);
    return l;
  });
  return finish(items, total);
}

export function countMatching(f: Filters, newSince?: string | null): { total: number; fresh: number } {
  const db = getDb();
  const { where, params } = buildWhere(f);
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE ${where}`).get(...params) as { c: number }
  ).c;
  let fresh = 0;
  if (newSince) {
    fresh = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM listings WHERE ${where} AND first_seen_at > ?`)
        .get(...params, newSince) as { c: number }
    ).c;
  }
  return { total, fresh };
}

export function getListing(id: number): Listing | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT ${AI_SELECT} FROM listings l LEFT JOIN ai_analysis a ON a.listing_id = l.id WHERE l.id = ?`)
    .get(id) as ListingRow | undefined;
  if (!row) return null;
  const listing = rowToListing(row);
  listing.valuePct = valuePct(computeBaselines(), listing);
  listing.priceHistory = db
    .prepare('SELECT price, seen_at AS seenAt FROM price_history WHERE listing_id = ? ORDER BY seen_at')
    .all(id) as PricePoint[];
  return listing;
}

export function setFavorite(id: number, on: boolean): boolean {
  return (
    getDb()
      .prepare('UPDATE listings SET favorited_at = ? WHERE id = ?')
      .run(on ? now() : null, id).changes > 0
  );
}

export function setHidden(id: number, on: boolean): boolean {
  return (
    getDb()
      .prepare('UPDATE listings SET hidden_at = ? WHERE id = ?')
      .run(on ? now() : null, id).changes > 0
  );
}

/** Attach the latest price decrease (from the recorded price history). */
function attachPriceDrops(items: Listing[]): void {
  const stmt = getDb().prepare(
    'SELECT price, seen_at FROM price_history WHERE listing_id = ? ORDER BY seen_at DESC, id DESC LIMIT 2',
  );
  for (const l of items) {
    const rows = stmt.all(l.id) as { price: number; seen_at: string }[];
    if (rows.length === 2 && rows[1].price > rows[0].price) {
      l.priceDrop = { from: rows[1].price, at: rows[0].seen_at };
    }
  }
}

export function getStats(): {
  sources: { source: string; active: number; total: number; lastRefresh: string | null }[];
  totalActive: number;
  favorites: number;
  hidden: number;
} {
  const db = getDb();
  const sources = db
    .prepare(
      `SELECT l.source,
              SUM(l.is_active) AS active,
              COUNT(*) AS total,
              (SELECT MAX(finished_at) FROM refresh_runs r WHERE r.source = l.source AND r.ok = 1) AS lastRefresh
       FROM listings l GROUP BY l.source ORDER BY active DESC`,
    )
    .all() as { source: string; active: number; total: number; lastRefresh: string | null }[];
  const totalActive = sources.reduce((s, r) => s + r.active, 0);
  const favorites = (
    db.prepare('SELECT COUNT(*) AS c FROM listings WHERE favorited_at IS NOT NULL').get() as { c: number }
  ).c;
  const hidden = (
    db.prepare('SELECT COUNT(*) AS c FROM listings WHERE hidden_at IS NOT NULL').get() as { c: number }
  ).c;
  return { sources, totalActive, favorites, hidden };
}
