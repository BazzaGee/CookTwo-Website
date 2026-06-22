import type { Context } from 'hono';
import type { Env } from '../env';
import { logToD1 } from '../lib/activity';
import { readBearer } from '../lib/jwt';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'any';

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
  mealType: MealType = 'dinner',
): Promise<WeekMeal[]> {
  const now = Date.now();
  const results: WeekMeal[] = [];

  for (const meal of meals) {
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO meal_plans (id, household_id, day_of_week, meal_type, meal_name, meal_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, householdId, meal.dayOfWeek, mealType, meal.mealName, meal.mealData, now)
      .run();

    results.push({
      id,
      householdId,
      dayOfWeek: meal.dayOfWeek,
      mealType,
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
  const body = (await c.req.json().catch(() => ({}))) as { mealType?: MealType };
  const mealType: MealType = body.mealType || 'dinner';
  const { generateMeal } = await import('../lib/ai');
  const { getPartners } = await import('./profiles');
  const { getCoupleDietRules } = await import('../lib/diet-rules');

  await clearWeekPlan(c.env.DB, householdId);

  const profiles = await getPartners(c.env.DB, householdId);
  const p1 = profiles.find((p) => p.slot === 1);
  const p2 = profiles.find((p) => p.slot === 2);
  const p1Diet = p1?.diet ?? 'omnivore';
  const p2Diet = p2?.diet ?? 'omnivore';
  const p1Allergens = p1?.allergens ?? [];
  const p2Allergens = p2?.allergens ?? [];
  const p1Goal = p1?.goal ?? null;
  const p2Goal = p2?.goal ?? null;
  const p1Body = p1?.tdee ? { name: p1.name, tdee: p1.tdee } : undefined;
  const p2Body = p2?.tdee ? { name: p2.name, tdee: p2.tdee } : undefined;

  const p1Fasting = p1?.fastingMode ?? null;
  const p2Fasting = p2?.fastingMode ?? null;
  const dietRules = await getCoupleDietRules(c.env.DB, p1Diet, p2Diet, p1Fasting, p2Fasting);

  const pantryRes = await c.env.HOUSEHOLD_SYNC
    .get(c.env.HOUSEHOLD_SYNC.idFromName(householdId))
    .fetch('https://do/pantry');
  const pantryItems = (await pantryRes.json()) as Array<{ name: string; quantity: string }>;

  const partnerContext = profiles.map((p) => ({
    name: p.name,
    diet: (p.diet || 'omnivore') as 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'paleo' | 'gluten-free',
    allergens: p.allergens,
    tdee: p.tdee,
    goal: p.goal,
    activityLevel: p.activityLevel,
    slot: p.slot as 1 | 2,
  }));

  const meals: Array<{ dayOfWeek: DayOfWeek; mealName: string; mealData: string }> = [];

  for (const day of DAYS) {
    const meal = await generateMeal(c.env, pantryItems, p1Diet, p2Diet, p1Allergens, p2Allergens, p1Goal, p2Goal, p1Body, p2Body, partnerContext, dietRules.promptBlock, dietRules.combinedClassifierTerms, dietRules.combinedRestrictedGroups, mealType);
    if (meal) {
      meals.push({
        dayOfWeek: day,
        mealName: meal.name,
        mealData: JSON.stringify(meal),
      });
    } else {
      console.error(`AI failed to generate ${mealType} for ${day}. Skipping.`);
    }
  }

  const saved = await saveWeekPlan(c.env.DB, householdId, meals, mealType);

  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  await logToD1(c.env.DB, {
    householdId,
    partnerId: claims?.partnerId ?? null,
    partnerSlot: claims?.slot ?? null,
    partnerName: claims?.displayName ?? null,
    actionType: 'week_plan_generated',
    targetKind: 'meal',
    targetName: `${meals.length} meals (${mealType})`,
    payload: { days: meals.map((m) => ({ day: m.dayOfWeek, name: m.mealName })) },
  }).catch((err) => console.error('activity log failed:', err));

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
