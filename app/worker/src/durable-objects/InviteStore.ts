import type { Env } from '../env';

export class InviteStore {
  private state: DurableObjectState;
  private env: Env;
  private initialized = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;
    await this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS invite_codes (
         code TEXT PRIMARY KEY,
         household_id TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
    );
    this.initialized = true;
  }

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.state.blockConcurrencyWhile(async () => {
      await this.ensureSchema();
    });

    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    try {
      if (path === '/codes' && method === 'POST') {
        const body = (await request.json()) as { householdId: string };
        if (!body.householdId) throw new Error('householdId required');
        const code = generateInviteCode();
        this.state.storage.sql.exec(
          'INSERT INTO invite_codes (code, household_id, created_at) VALUES (?, ?, ?)',
          code,
          body.householdId,
          Date.now(),
        );
        return this.json({ code, householdId: body.householdId });
      }

      const lookupMatch = path.match(/^\/codes\/(\d{6})$/);
      if (lookupMatch && method === 'GET') {
        const cursor = this.state.storage.sql.exec<{ household_id: string }>(
          'SELECT household_id FROM invite_codes WHERE code = ?',
          lookupMatch[1],
        );
        const row = Array.from(cursor)[0];
        if (!row) return this.json({ error: 'invite_not_found' }, 404);
        return this.json({ code: lookupMatch[1] as string, householdId: row.household_id });
      }

      return this.json({ error: 'not_found', path, method }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      return this.json({ error: 'bad_request', message }, 400);
    }
  }
}

function generateInviteCode(): string {
  const max = 1_000_000;
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const n = (arr[0] ?? 0) % max;
  return n.toString().padStart(6, '0');
}
