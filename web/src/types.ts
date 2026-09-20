export interface Listing {
  id: number;
  source: string;
  sourceId: string;
  url: string;
  title: string;
  propertyType: string | null;
  isNewBuild: boolean;
  constructionStatus: 'planned' | 'building' | 'done' | null;
  delivery: string | null;
  price: number;
  rooms: number | null;
  bathrooms: number | null;
  sqm: number | null;
  floor: number | null;
  isTopFloor: boolean;
  hasElevator: boolean | null;
  buildingYear: number | null;
  address: string | null;
  neighborhood: string | null;
  municipality: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  flags: string[];
  images: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  favoritedAt: string | null;
  hiddenAt: string | null;
  units: UnitType[] | null;
  priceDrop?: { from: number; at: string } | null;
  valuePct?: number | null;
  ai?: AiAnalysis | null;
}

export interface UnitType {
  price: number | null;
  sold: boolean;
  rooms: number | null;
  baths: number | null;
  sqm: number | null;
  floor: number | null;
  type: string | null;
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

export interface AiStatus {
  configured: boolean;
  model: string;
  hint?: string;
}

export interface SyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  currentSource: string | null;
  log: string[];
  summaries: RefreshSummary[];
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

export interface Filters {
  minRooms?: number;
  maxRooms?: number;
  minBathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minSqm?: number;
  maxSqm?: number;
  minFloor?: number;
  maxBuildingAgeYears?: number;
  minBuildingYear?: number;
  neighborhoods?: string[];
  mustHaveElevator?: boolean;
  newBuildOnly?: boolean;
  keywords?: string[];
  sources?: string[];
  onlyFavorites?: boolean;
  onlyHidden?: boolean;
  resaleOnly?: boolean;
  topFloorOnly?: boolean;
  futureOnly?: boolean;
  includeUnknownFloor?: boolean;
  includeUnknownYear?: boolean;
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

export interface Stats {
  sources: { source: string; active: number; total: number; lastRefresh: string | null }[];
  totalActive: number;
  favorites: number;
  hidden: number;
  sourcesAvailable: string[];
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
}
