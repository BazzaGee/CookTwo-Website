import type { Context } from 'hono';
import type { Env } from '../env';
import { logToD1 } from '../lib/activity';
import { readBearer } from '../lib/jwt';

export interface SavedRecipe {
  id: string;
  householdId: string;
  name: string;
  mealData: string;
  savedAt: number;
  timesCooked: number;
}

interface RecipeRow {
  id: string;
  household_id: string;
  name: string;
  meal_data: string;
  saved_at: number;
  times_cooked: number;
}

function rowToRecipe(row: RecipeRow): SavedRecipe {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    mealData: row.meal_data,
    savedAt: row.saved_at,
    timesCooked: row.times_cooked,
  };
}

export async function getRecipes(db: D1Database, householdId: string): Promise<SavedRecipe[]> {
  const { results } = await db.prepare(
    'SELECT * FROM recipes WHERE household_id = ? ORDER BY saved_at DESC',
  )
    .bind(householdId)
    .all<RecipeRow>();
  return (results ?? []).map(rowToRecipe);
}

export async function saveRecipe(
  db: D1Database,
  householdId: string,
  name: string,
  mealData: string,
): Promise<SavedRecipe> {
  const id = crypto.randomUUID();
  const now = Date.now();

  await db.prepare(
    `INSERT INTO recipes (id, household_id, name, meal_data, saved_at, times_cooked)
     VALUES (?, ?, ?, ?, ?, 0)`,
  )
    .bind(id, householdId, name, mealData, now)
    .run();

  return { id, householdId, name, mealData, savedAt: now, timesCooked: 0 };
}

export async function handleGetRecipes(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const recipes = await getRecipes(c.env.DB, householdId);
  return c.json(recipes);
}

export async function handleSaveRecipe(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; mealData?: string };

  if (!body.name || !body.mealData) {
    return c.json({ error: 'name and mealData required' }, 400);
  }

  const recipe = await saveRecipe(c.env.DB, householdId, body.name, body.mealData);

  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  await logToD1(c.env.DB, {
    householdId,
    partnerId: claims?.partnerId ?? null,
    partnerSlot: claims?.slot ?? null,
    partnerName: claims?.displayName ?? null,
    actionType: 'recipe_saved',
    targetKind: 'recipe',
    targetId: recipe.id,
    targetName: recipe.name,
  }).catch((err) => console.error('activity log failed:', err));

  return c.json(recipe, 201);
}

export async function deleteRecipe(
  db: D1Database,
  householdId: string,
  recipeId: string,
): Promise<boolean> {
  const result = await db.prepare(
    'DELETE FROM recipes WHERE id = ? AND household_id = ?',
  )
    .bind(recipeId, householdId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function handleDeleteRecipe(c: Context<{ Bindings: Env }>) {
  const householdId = c.req.param('id') as string;
  const recipeId = c.req.param('recipeId') as string;

  const deleted = await deleteRecipe(c.env.DB, householdId, recipeId);
  if (!deleted) {
    return c.json({ error: 'recipe not found' }, 404);
  }

  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  await logToD1(c.env.DB, {
    householdId,
    partnerId: claims?.partnerId ?? null,
    partnerSlot: claims?.slot ?? null,
    partnerName: claims?.displayName ?? null,
    actionType: 'recipe_deleted',
    targetKind: 'recipe',
    targetId: recipeId,
  }).catch((err) => console.error('activity log failed:', err));

  return c.json({ deleted: true });
}
