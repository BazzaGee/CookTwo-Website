import type { Context } from 'hono';
import type { Env } from '../env';
import { chatWithAI, type ChatResponse } from '../lib/ai';
import { getPartners, type Diet } from './profiles';
import { readBearer } from '../lib/jwt';

const CLASSIFY_KEYWORDS: Array<{ category: string; words: string[] }> = [
  { category: 'Produce', words: ['apple', 'banana', 'orange', 'lettuce', 'spinach', 'tomato', 'potato', 'onion', 'garlic', 'carrot', 'pepper', 'cucumber', 'broccoli', 'kale', 'mushroom', 'avocado', 'lemon', 'lime', 'berry', 'grape', 'mango', 'peach', 'pear', 'corn', 'zucchini', 'celery', 'ginger', 'herb', 'basil', 'cilantro', 'parsley'] },
  { category: 'Meat', words: ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'fish', 'salmon', 'tuna', 'shrimp', 'bacon', 'sausage', 'ham', 'steak', 'ground', 'fillet', 'breast', 'thigh', 'mince', 'prawn'] },
  { category: 'Dairy', words: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'eggs', 'sour cream', 'cottage cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'gouda', 'brie', 'cream cheese', 'kefir'] },
  { category: 'Pantry', words: ['rice', 'pasta', 'flour', 'sugar', 'salt', 'pepper', 'oil', 'olive oil', 'vinegar', 'sauce', 'soup', 'canned', 'beans', 'lentils', 'cereal', 'oats', 'bread', 'tortilla', 'honey', 'peanut butter', 'jam', 'tea', 'coffee', 'spice', 'soy sauce', 'sesame oil', 'coconut oil', 'wheat', 'oat', 'quinoa', 'noodle'] },
];

function classifyItem(name: string): string {
  const normalized = name.toLowerCase().trim();
  for (const { category, words } of CLASSIFY_KEYWORDS) {
    if (words.some((w) => normalized.includes(w))) return category;
  }
  return 'Other';
}

export async function handleMealChat(c: Context<{ Bindings: Env }>): Promise<Response> {
  const householdId = c.req.param('id') as string;
  const claims = await readBearer(c.env.JWT_SECRET, c.req.raw);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    message?: string;
    history?: Array<{ role: string; content: string }>;
  };

  const userMessage = (body.message ?? '').trim();
  if (!userMessage) {
    return c.json({ error: 'message is required' }, 400);
  }

  const history = (body.history ?? []).map((m) => ({
    role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content,
  }));

  const pantryRes = await c.env.HOUSEHOLD_SYNC
    .get(c.env.HOUSEHOLD_SYNC.idFromName(householdId))
    .fetch('https://do/pantry');
  const pantryItems = (await pantryRes.json()) as Array<{
    name: string;
    quantity: string;
    category?: string;
    quantityValue?: number | null;
    quantityUnit?: string;
  }>;

  const profiles = await getPartners(c.env.DB, householdId);
  const partnerContext = profiles.map((p) => ({
    name: p.name,
    diet: p.diet as Diet,
    allergies: p.allergies,
    tdee: p.tdee,
    slot: p.slot as 1 | 2,
  }));

  const response = await chatWithAI(c.env, pantryItems, partnerContext, history, userMessage);

  const results: ChatResponse = { message: response.message };

  if (response.actions) {
    const addedToPantry: string[] = [];
    const addedToList: string[] = [];

    if (response.actions.addToPantry && response.actions.addToPantry.length > 0) {
      for (const itemName of response.actions.addToPantry) {
        const name = itemName.trim();
        if (!name) continue;
        try {
          await c.env.HOUSEHOLD_SYNC
            .get(c.env.HOUSEHOLD_SYNC.idFromName(householdId))
            .fetch('https://do/pantry', {
              method: 'POST',
              body: JSON.stringify({
                name,
                quantity: '',
                addedByPartnerId: claims.partnerId,
                addedByPartnerSlot: claims.slot,
              }),
              headers: { 'content-type': 'application/json' },
            });
          addedToPantry.push(name);
        } catch (err) {
          console.error(`Failed to add ${name} to pantry:`, err);
        }
      }
    }

    if (response.actions.addToList && response.actions.addToList.length > 0) {
      for (const itemName of response.actions.addToList) {
        const name = itemName.trim();
        if (!name) continue;
        try {
          await c.env.HOUSEHOLD_SYNC
            .get(c.env.HOUSEHOLD_SYNC.idFromName(householdId))
            .fetch('https://do/items', {
              method: 'POST',
              body: JSON.stringify({
                name,
                category: classifyItem(name),
                addedByPartnerId: claims.partnerId,
                addedByPartnerSlot: claims.slot,
              }),
              headers: { 'content-type': 'application/json' },
            });
          addedToList.push(name);
        } catch (err) {
          console.error(`Failed to add ${name} to list:`, err);
        }
      }
    }

    if (addedToPantry.length > 0 || addedToList.length > 0) {
      results.actions = {};
      if (addedToPantry.length > 0) results.actions.addToPantry = addedToPantry;
      if (addedToList.length > 0) results.actions.addToList = addedToList;
    }
  }

  if (response.meal) {
    results.meal = response.meal;
  }

  return c.json(results);
}
