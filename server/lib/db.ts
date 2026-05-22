import Database from 'better-sqlite3';
import { env } from './env';

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(env.DATABASE_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS garments (
      id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      category TEXT,
      note TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id),
      garment_id TEXT NOT NULL REFERENCES garments(id),
      result_url TEXT,
      status TEXT NOT NULL CHECK(status IN ('queued','running','done','failed')),
      model_used TEXT,
      cost_usd REAL,
      error_message TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status, created_at);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function setMeta(key: string, value: string) {
  db().prepare(`
    INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, Date.now());
}

export function getMeta(key: string): { value: string; updated_at: number } | null {
  const row = db().prepare('SELECT value, updated_at FROM meta WHERE key = ?').get(key) as
    | { value: string; updated_at: number }
    | undefined;
  return row ?? null;
}
