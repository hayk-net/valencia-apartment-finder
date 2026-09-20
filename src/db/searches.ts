import { getDb, now } from './index.js';
import { countMatching } from './listings.js';
import type { Filters, SavedSearch } from '../types.js';

interface SearchRow {
  id: number;
  name: string;
  raw_query: string;
  filters_json: string;
  created_at: string;
  last_viewed_at: string | null;
}

function rowToSearch(r: SearchRow): SavedSearch {
  return {
    id: r.id,
    name: r.name,
    rawQuery: r.raw_query,
    filters: JSON.parse(r.filters_json) as Filters,
    createdAt: r.created_at,
    lastViewedAt: r.last_viewed_at,
  };
}

export function listSearches(withCounts = true): SavedSearch[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM saved_searches ORDER BY created_at DESC').all() as SearchRow[];
  return rows.map((r) => {
    const s = rowToSearch(r);
    if (withCounts) {
      const { total, fresh } = countMatching(s.filters, s.lastViewedAt);
      s.matchCount = total;
      s.newCount = s.lastViewedAt ? fresh : 0;
    }
    return s;
  });
}

export function createSearch(name: string, rawQuery: string, filters: Filters): SavedSearch {
  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO saved_searches (name, raw_query, filters_json, created_at, last_viewed_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(name, rawQuery, JSON.stringify(filters), now(), now());
  const row = db
    .prepare('SELECT * FROM saved_searches WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as SearchRow;
  return rowToSearch(row);
}

export function updateSearch(
  id: number,
  patch: { name?: string; rawQuery?: string; filters?: Filters },
): SavedSearch | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id) as SearchRow | undefined;
  if (!row) return null;
  db.prepare('UPDATE saved_searches SET name = ?, raw_query = ?, filters_json = ? WHERE id = ?').run(
    patch.name ?? row.name,
    patch.rawQuery ?? row.raw_query,
    patch.filters ? JSON.stringify(patch.filters) : row.filters_json,
    id,
  );
  return rowToSearch(db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id) as SearchRow);
}

export function deleteSearch(id: number): boolean {
  return getDb().prepare('DELETE FROM saved_searches WHERE id = ?').run(id).changes > 0;
}

export function markViewed(id: number): void {
  getDb().prepare('UPDATE saved_searches SET last_viewed_at = ? WHERE id = ?').run(now(), id);
}
