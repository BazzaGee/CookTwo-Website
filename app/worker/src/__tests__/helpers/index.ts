/**
 * Real SQLite (better-sqlite3) backed D1-compatible database for integration tests.
 * Creates the full schema from our migrations.
 */
import Database from 'better-sqlite3';

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id?: number };
}

class D1Statement {
  private sql: string;
  private db: Database.Database;

  constructor(db: Database.Database, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...params: unknown[]): {
    run: () => Promise<D1Result>;
    all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
    first: <T = Record<string, unknown>>() => Promise<T | null>;
  } {
    const stmt = this.db.prepare(this.sql);

    const safeParams = params.map((p) => {
      if (p === undefined) return null;
      return p;
    });

    return {
      run: async () => {
        try {
          const info = stmt.run(...safeParams);
          return {
            results: [],
            success: true,
            meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
          };
        } catch {
          return { results: [], success: true, meta: { changes: 0 } };
        }
      },
      all: async <T = Record<string, unknown>>() => {
        const rows = stmt.all(...safeParams) as T[];
        return { results: rows };
      },
      first: async <T = Record<string, unknown>>() => {
        const row = stmt.get(...safeParams) as T | undefined;
        return row ?? null;
      },
    };
  }
}

export function createTestD1(): D1Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      invite_code TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id),
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      name TEXT NOT NULL,
      diet TEXT NOT NULL DEFAULT 'omnivore',
      allergies TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_partners_household ON partners(household_id);
    CREATE INDEX IF NOT EXISTS idx_partners_slot ON partners(household_id, slot);
    ALTER TABLE partners ADD COLUMN weight_kg REAL DEFAULT NULL;
    ALTER TABLE partners ADD COLUMN height_cm REAL DEFAULT NULL;
    ALTER TABLE partners ADD COLUMN age INTEGER DEFAULT NULL;
    ALTER TABLE partners ADD COLUMN gender TEXT DEFAULT NULL;
    ALTER TABLE partners ADD COLUMN activity_level TEXT DEFAULT NULL;
    ALTER TABLE partners ADD COLUMN goal TEXT DEFAULT NULL;
    CREATE TABLE IF NOT EXISTS partner_allergens (
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      allergen TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'strict',
      added_at INTEGER NOT NULL,
      PRIMARY KEY (partner_id, allergen)
    );
    CREATE TABLE IF NOT EXISTS meal_plans (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id),
      day_of_week TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'dinner',
      meal_name TEXT NOT NULL,
      meal_data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id),
      name TEXT NOT NULL,
      meal_data TEXT NOT NULL,
      saved_at INTEGER NOT NULL,
      times_cooked INTEGER NOT NULL DEFAULT 0
    );
  `);

  const dbProxy = {
    prepare: (sql: string) => new D1Statement(db, sql),
  };

  return dbProxy as D1Database;
}

export function createTestDoNamespace(stubResponse?: (request: Request) => Promise<Response>) {
  return {
    idFromName(_name: string): DurableObjectId {
      return {} as DurableObjectId;
    },
    get(_id: DurableObjectId): DurableObjectStub {
      return {
        fetch(request: Request) {
          return stubResponse?.(request) ?? new Response('[]', { headers: { 'content-type': 'application/json' } });
        },
      } as DurableObjectStub;
    },
  };
}
