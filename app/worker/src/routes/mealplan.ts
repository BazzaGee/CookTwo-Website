import type { Context } from 'hono';
import type { Env } from '../env';
import { logToD1 } from '../lib/activity';
import { readBearer } from '../lib/jwt';

export async function handleConfirmMeal(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const body = (await c.req.json().catch(() => ({}))) as {
    mealData?: unknown;
    usedIngredients?: Array<{ name: string; quantityValue: number | null; quantityUnit: string }>;
  };

  const usedIngredients = body.usedIngredients ?? [];
  if (usedIngredients.length === 0) {
    return c.json({ updated: [], removed: [], message: 'No ingredients to subtract' });
  }

  const stub = c.env.HOUSEHOLD_SYNC.get(c.env.HOUSEHOLD_SYNC.idFromName(householdId));
  const result = await stub.fetch('https://do/pantry/subtract', {
    method: 'POST',
    body: JSON.stringify({ usedIngredients }),
    headers: { 'content-type': 'application/json' },
  });

  const data = (await result.json()) as { updated: string[]; removed: string[] };

  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  await logToD1(c.env.DB, {
    householdId,
    partnerId: claims?.partnerId ?? null,
    partnerSlot: claims?.slot ?? null,
    partnerName: claims?.displayName ?? null,
    actionType: 'meal_confirmed',
    targetKind: 'meal',
    targetName: `${data.updated.length + data.removed.length} pantry items adjusted`,
    payload: { updated: data.updated, removed: data.removed },
  }).catch((err) => console.error('activity log failed:', err));

  return c.json(data);
}
