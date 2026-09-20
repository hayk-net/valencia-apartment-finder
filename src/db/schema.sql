CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  property_type TEXT,
  is_new_build INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL,
  rooms INTEGER,
  bathrooms INTEGER,
  sqm REAL,
  floor INTEGER,
  is_top_floor INTEGER NOT NULL DEFAULT 0,
  has_elevator INTEGER,
  building_year INTEGER,
  construction_status TEXT,
  delivery TEXT,
  address TEXT,
  neighborhood TEXT,
  municipality TEXT,
  lat REAL,
  lng REAL,
  description TEXT,
  flags_json TEXT NOT NULL DEFAULT '[]',
  images_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  enriched_at TEXT,
  favorited_at TEXT,
  hidden_at TEXT,
  units_json TEXT,
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_active_price ON listings (is_active, price);
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings (source);
CREATE INDEX IF NOT EXISTS idx_listings_first_seen ON listings (first_seen_at);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  price INTEGER NOT NULL,
  seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history (listing_id);

CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  raw_query TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_viewed_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  listing_id INTEGER PRIMARY KEY REFERENCES listings (id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  criteria_hash TEXT NOT NULL,
  analyzed_price INTEGER NOT NULL,
  gem_score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  pros_json TEXT NOT NULL DEFAULT '[]',
  cons_json TEXT NOT NULL DEFAULT '[]',
  red_flags_json TEXT NOT NULL DEFAULT '[]',
  analyzed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  found INTEGER,
  added INTEGER,
  updated INTEGER,
  price_changes INTEGER,
  deactivated INTEGER,
  full_sweep INTEGER NOT NULL DEFAULT 0,
  ok INTEGER,
  error TEXT
);
