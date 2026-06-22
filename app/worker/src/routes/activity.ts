import type { Context } from 'hono';
import type { Env } from '../env';
import { getActivityFromD1, type ActivityEntry } from '../lib/activity';

export async function handleGetActivity(c: Context<{ Bindings: Env }>): Promise<Response> {
  const householdId = c.req.param('id') as string;
  const limit = parseInt(c.req.query('limit') ?? '50', 10) || 50;
  const beforeParam = c.req.query('before');
  const before = beforeParam ? parseInt(beforeParam, 10) : undefined;

  const d1Entries = await getActivityFromD1(c.env.DB, householdId, limit, before);

  let doEntries: ActivityEntry[] = [];
  try {
    const stub = c.env.HOUSEHOLD_SYNC.get(c.env.HOUSEHOLD_SYNC.idFromName(householdId));
    const params = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) params.set('before', String(before));
    const doRes = await stub.fetch(`https://do/activity?${params.toString()}`);
    if (doRes.ok) {
      doEntries = (await doRes.json()) as ActivityEntry[];
    }
  } catch (err) {
    console.error('Failed to read activity from DO:', err);
  }

  const merged = [...d1Entries, ...doEntries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);

  return c.json(merged);
}
