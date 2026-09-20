import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.REALTOR_DATA_DIR ?? path.join(ROOT, 'data');
const DB_PATH = process.env.REALTOR_DB ?? path.join(DATA_DIR, 'realtor.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // hosted server + CLI jobs share this file
  db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  // additive migrations for databases created before these columns existed
  for (const ddl of [
    'ALTER TABLE listings ADD COLUMN is_top_floor INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE listings ADD COLUMN enriched_at TEXT',
    "ALTER TABLE listings ADD COLUMN flags_json TEXT NOT NULL DEFAULT '[]'",
    'ALTER TABLE listings ADD COLUMN favorited_at TEXT',
    'ALTER TABLE listings ADD COLUMN hidden_at TEXT',
    'ALTER TABLE listings ADD COLUMN units_json TEXT',
    'ALTER TABLE listings ADD COLUMN construction_status TEXT',
    'ALTER TABLE listings ADD COLUMN delivery TEXT',
  ]) {
    try {
      db.exec(ddl);
    } catch {
      // column already exists
    }
  }
  return db;
}

export function now(): string {
  return new Date().toISOString();
}
