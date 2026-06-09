import type { Context } from 'hono';
import type { Env } from '../env';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface WeekMeal {
  id: string;
  householdId: string;
  dayOfWeek: DayOfWeek;
  mealType: MealType;
  mealName: string;
  mealData: string;
  createdAt: number;
}

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export async function getWeekPlan(db: D1Database, householdId: string): Promise<WeekMeal[]> {
  const { results } = await db.prepare(
    `SELECT id, household_id AS householdId, day_of_week AS dayOfWeek, meal_type AS mealType,
            meal_name AS mealName, meal_data AS mealData, created_at AS createdAt
     FROM meal_plans WHERE household_id = ? ORDER BY day_of_week ASC`,
  )
    .bind(householdId)
    .all<WeekMeal>();
  return results ?? [];
}

export async function saveWeekPlan(
  db: D1Database,
  householdId: string,
  meals: Array<{ dayOfWeek: DayOfWeek; mealName: string; mealData: string }>,
): Promise<WeekMeal[]> {
  const now = Date.now();
  const results: WeekMeal[] = [];

  for (const meal of meals) {
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO meal_plans (id, household_id, day_of_week, meal_type, meal_name, meal_data, created_at)
       VALUES (?, ?, ?, 'dinner', ?, ?, ?)`,
    )
      .bind(id, householdId, meal.dayOfWeek, meal.mealName, meal.mealData, now)
      .run();

    results.push({
      id,
      householdId,
      dayOfWeek: meal.dayOfWeek,
      mealType: 'dinner',
      mealName: meal.mealName,
      mealData: meal.mealData,
      createdAt: now,
    });
  }

  return results;
}

export async function clearWeekPlan(db: D1Database, householdId: string): Promise<void> {
  await db.prepare('DELETE FROM meal_plans WHERE household_id = ?')
    .bind(householdId)
    .run();
}

export async function handleGetWeekPlan(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const plan = await getWeekPlan(c.env.DB, householdId);
  return c.json(plan);
}

export async function handleGenerateWeekPlan(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const { generateMeal } = await import('../lib/ai');
  const { getPartners } = await import('./profiles');

  await clearWeekPlan(c.env.DB, householdId);

  const profiles = await getPartners(c.env.DB, householdId);
  const p1Diet = profiles.find((p) => p.slot === 1)?.diet ?? 'omnivore';
  const p2Diet = profiles.find((p) => p.slot === 2)?.diet ?? 'omnivore';

  const pantryRes = await c.env.HOUSEHOLD_SYNC
    .get(c.env.HOUSEHOLD_SYNC.idFromName(householdId))
    .fetch('https://do/pantry');
  const pantryItems = (await pantryRes.json()) as Array<{ name: string; quantity: string }>;

  const meals: Array<{ dayOfWeek: DayOfWeek; mealName: string; mealData: string }> = [];

  for (const day of DAYS) {
    const meal = await generateMeal(c.env, pantryItems, p1Diet, p2Diet);
    if (meal) {
      meals.push({
        dayOfWeek: day,
        mealName: meal.name,
        mealData: JSON.stringify(meal),
      });
    } else {
      console.error(`AI failed to generate meal for ${day}. Skipping.`);
    }
  }

  const saved = await saveWeekPlan(c.env.DB, householdId, meals);
  return c.json(saved);
}

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
  return c.json(data);
}
