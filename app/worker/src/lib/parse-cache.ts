interface ParseCacheRow {
  input_hash: string;
  raw_input: string;
  parsed_json: string;
  source: string;
  created_at: number;
  [key: string]: string | number;
}

export interface ParseCacheEntry {
  inputHash: string;
  rawInput: string;
  parsedJson: string;
  source: 'regex' | 'ai';
  createdAt: number;
}

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

function rowToEntry(row: ParseCacheRow): ParseCacheEntry {
  return {
    inputHash: row.input_hash,
    rawInput: row.raw_input,
    parsedJson: row.parsed_json,
    source: row.source as 'regex' | 'ai',
    createdAt: row.created_at,
  };
}

export async function getCachedParse(
  sql: DurableObjectStorage['sql'],
  inputHash: string,
): Promise<ParseCacheEntry | null> {
  try {
    const cursor = sql.exec<ParseCacheRow>('SELECT * FROM pantry_parse_cache WHERE input_hash = ?', inputHash);
    const rows = Array.from(cursor);
    const result = rows[0];

    if (!result) return null;

    if (Date.now() - result.created_at > CACHE_TTL) {
      sql.exec('DELETE FROM pantry_parse_cache WHERE input_hash = ?', inputHash);
      return null;
    }

    return rowToEntry(result);
  } catch {
    return null;
  }
}

export async function cacheParse(
  sql: DurableObjectStorage['sql'],
  entry: ParseCacheEntry,
): Promise<void> {
  try {
    sql.exec(
      'INSERT OR REPLACE INTO pantry_parse_cache (input_hash, raw_input, parsed_json, source, created_at) VALUES (?, ?, ?, ?, ?)',
      entry.inputHash,
      entry.rawInput,
      entry.parsedJson,
      entry.source,
      entry.createdAt,
    );
  } catch {
  }
}

export async function cleanExpiredCache(
  sql: DurableObjectStorage['sql'],
): Promise<void> {
  try {
    const cutoff = Date.now() - CACHE_TTL;
    sql.exec('DELETE FROM pantry_parse_cache WHERE created_at < ?', cutoff);
  } catch {
  }
}
