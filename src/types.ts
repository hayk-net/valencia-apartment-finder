/** A normalized listing, regardless of which portal/developer site it came from. */
export interface Listing {
  id: number;
  source: string;
  sourceId: string;
  url: string;
  title: string;
  propertyType: string | null;
  isNewBuild: boolean;
  /** future projects ("sobre plano"): planned = pre-construction, building = under construction */
  constructionStatus: 'planned' | 'building' | 'done' | null;
  /** delivery estimate as the source states it ("II Trimestre 2027") */
  delivery: string | null;
  price: number; // euros
  rooms: number | null;
  bathrooms: number | null;
  sqm: number | null;
  floor: number | null; // 0 = ground floor; null = unknown (common on new-builds)
  /** "ático" / "última planta" — known top floor even when the number is unknown */
  isTopFloor: boolean;
  hasElevator: boolean | null;
  buildingYear: number | null; // null = unknown (portals rarely provide it)
  address: string | null;
  neighborhood: string | null;
  municipality: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  /** structured deal-breaker warnings from the source itself (nuda propiedad, ocupada, subasta…) */
  flags: string[];
  images: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  /** set when the user hearts the listing; favorites survive deactivation */
  favoritedAt: string | null;
  /** set when the user dismisses the listing ("not interested") */
  hiddenAt: string | null;
  /** new-development typologies (viviendasnuevas promos): per-unit table data */
  units: UnitType[] | null;
  /** most recent price change, when it was a decrease */
  priceDrop?: { from: number; at: string } | null;
  priceHistory?: PricePoint[];
  /** % below the area's median €/m² (positive = cheaper than typical); null when sqm unknown */
  valuePct?: number | null;
  /** Claude analyst result, when this listing has been analyzed */
  ai?: AiAnalysis | null;
}

export interface AiAnalysis {
  score: number;
  verdict: string;
  pros: string[];
  cons: string[];
  redFlags: string[];
  model: string;
  criteriaHash: string;
  analyzedPrice: number;
  analyzedAt: string;
}

export interface PricePoint {
  price: number;
  seenAt: string;
}

/** One typology row of a new development ("Pisos, 3 habs." table). */
export interface UnitType {
  price: number | null; // null = sold or price on request
  sold: boolean;
  rooms: number | null;
  baths: number | null;
  sqm: number | null;
  floor: number | null;
  type: string | null; // Ático, Apartamento…
}

/** What a source adapter produces; the ingest runner fills in the bookkeeping fields. */
export type ScrapedListing = Omit<
  Listing,
  | 'id'
  | 'firstSeenAt'
  | 'lastSeenAt'
  | 'isActive'
  | 'priceHistory'
  | 'flags'
  | 'favoritedAt'
  | 'hiddenAt'
  | 'units'
  | 'priceDrop'
> & { raw?: unknown; flags?: string[]; units?: UnitType[] };

/**
 * Structured search criteria. Every field is optional — searches are data, not code.
 * Unknown-value policy: sources often omit floor/year/elevator; by default listings
 * with unknown values are INCLUDED (with a "?" badge in the UI) so filters don't
 * silently hide half the inventory. Toggle per field.
 */
export interface Filters {
  minRooms?: number;
  maxRooms?: number;
  minBathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minSqm?: number;
  maxSqm?: number;
  minFloor?: number;
  /** "max 50 years old" — evaluated against the current year at query time */
  maxBuildingAgeYears?: number;
  /** "built after 1990" — absolute variant */
  minBuildingYear?: number;
  neighborhoods?: string[];
  mustHaveElevator?: boolean;
  newBuildOnly?: boolean;
  /** free-text terms matched against title/description (e.g. "terrace") */
  keywords?: string[];
  sources?: string[];
  /** the favorites view — includes deactivated listings so vanished favorites stay visible */
  onlyFavorites?: boolean;
  /** review dismissed listings */
  onlyHidden?: boolean;
  /** quick categories */
  resaleOnly?: boolean;
  topFloorOnly?: boolean;
  /** future projects only: planned or under construction ("sobre plano") */
  futureOnly?: boolean;
  includeUnknownFloor?: boolean; // default true
  includeUnknownYear?: boolean; // default true
}

export interface SavedSearch {
  id: number;
  name: string;
  rawQuery: string;
  filters: Filters;
  createdAt: string;
  lastViewedAt: string | null;
  matchCount?: number;
  newCount?: number;
}

export type SortKey = 'gem' | 'newest' | 'price_asc' | 'price_desc' | 'sqm_desc' | 'eur_per_sqm';

export interface SearchRequest {
  filters?: Filters;
  sort?: SortKey;
  limit?: number;
  offset?: number;
}

export interface RefreshSummary {
  source: string;
  found: number;
  added: number;
  updated: number;
  priceChanges: number;
  deactivated: number;
  full: boolean;
  ok: boolean;
  error?: string;
  /** non-fatal anomaly worth surfacing (e.g. partial sweep — deactivation skipped) */
  warning?: string;
  /** listings fixed by re-parsing stored text (floor/year/elevator) */
  backfilled?: number;
  /** detail-page enrichment results */
  enriched?: { fetched: number; updated: number; failed: number };
}

/** Contract every portal/developer-site adapter implements. */
export interface SourceAdapter {
  name: string;
  /**
   * false when the adapter can never see the source's complete inventory
   * (e.g. no pagination) — the runner then skips deactivating unseen listings,
   * which would otherwise wrongly remove everything beyond the visible window.
   */
  supportsFullSweep?: boolean;
  /**
   * Fetch current listings. `full=true` sweeps everything (allows the runner to
   * deactivate listings that disappeared); default is an incremental pass over
   * the newest pages.
   */
  fetch(opts: { full: boolean; maxPages?: number }): Promise<ScrapedListing[]>;
}
