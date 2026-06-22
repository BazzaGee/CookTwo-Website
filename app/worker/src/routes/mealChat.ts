import type { Context } from 'hono';
import type { Env } from '../env';
import { chatWithAI, type ChatResponse, type ChatClarification } from '../lib/ai';
import { getPartners, type Diet } from './profiles';
import { getCoupleDietRules } from '../lib/diet-rules';
import { readBearer } from '../lib/jwt';
import { saveRecipe } from './recipes';
import { detectPantryConflict } from '../lib/pantry-conflict';
import { validateMealAgainstPantry } from '../lib/pantry-match';
import { refundAI } from '../lib/usage';

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
    mode?: 'auto' | 'cook_from_pantry' | 'generate_freely';
  };

  const userMessage = (body.message ?? '').trim();
  if (!userMessage) {
    return c.json({ error: 'message is required' }, 400);
  }

  const mode = body.mode ?? 'auto';
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
    allergens: p.allergens,
    tdee: p.tdee,
    goal: p.goal,
    activityLevel: p.activityLevel,
    slot: p.slot as 1 | 2,
  }));

  const p1Diet = profiles.find((p) => p.slot === 1)?.diet ?? 'omnivore';
  const p2Diet = profiles.find((p) => p.slot === 2)?.diet ?? 'omnivore';
  const p1Fasting = profiles.find((p) => p.slot === 1)?.fastingMode ?? null;
  const p2Fasting = profiles.find((p) => p.slot === 2)?.fastingMode ?? null;
  const dietRules = await getCoupleDietRules(c.env.DB, p1Diet, p2Diet, p1Fasting, p2Fasting);

  const allAllergens = Array.from(new Set(
    profiles.flatMap((p) => p.allergens).map((a) => a.trim().toLowerCase()).filter(Boolean),
  ));

  const conflict = detectPantryConflict(
    pantryItems.map((i) => ({ name: i.name, category: i.category, isFood: true })),
    allAllergens,
    dietRules.combinedClassifierTerms ?? {},
    dietRules.combinedRestrictedGroups ?? new Set<string>(),
  );

  const COOK_FROM_PANTRY: ChatClarification['options'][number] = {
    id: 'cook_from_pantry',
    label: 'Cook from pantry anyway',
    hint: conflict.hasAllergenConflict
      ? 'Relaxes diet preferences (allergens stay blocked for safety)'
      : 'Relaxes your dietary preferences',
  };
  const GENERATE_FREELY: ChatClarification['options'][number] = {
    id: 'generate_freely',
    label: "Generate freely — I'll shop",
    hint: 'Creates a unique meal and adds ingredients to your list',
  };

  if (conflict.totalFoodItems === 0 && mode === 'auto') {
    await refundAI(c.env.DB, householdId, 1);
    const clarification: ChatClarification = {
      kind: 'empty_pantry',
      conflictingItems: [],
      allergenBlocked: false,
      options: [GENERATE_FREELY],
    };
    return c.json({ message: "Your pantry is empty, so there's nothing to cook from. I can generate a meal from scratch and add the ingredients to your shopping list.", clarification });
  }

  if (conflict.safe.length === 0 && conflict.totalFoodItems > 0) {
    if (mode === 'auto') {
      await refundAI(c.env.DB, householdId, 1);
      const allergenBlocked = conflict.hasAllergenConflict;
      const conflicting = [...conflict.allergenConflicting, ...conflict.dietConflicting];
      const preview = conflicting.slice(0, 5).join(', ');
      const clarification: ChatClarification = {
        kind: 'pantry_diet_conflict',
        conflictingItems: conflicting,
        allergenBlocked,
        options: allergenBlocked && conflict.dietConflicting.length === 0
          ? [GENERATE_FREELY]
          : [COOK_FROM_PANTRY, GENERATE_FREELY],
      };
      const message = allergenBlocked
        ? `Everything in your pantry (${preview}) conflicts with your allergens or dietary restrictions. Want me to generate a completely new meal and add the ingredients to your shopping list?`
        : `Everything in your pantry (${preview}) conflicts with your dietary preferences. Want me to relax those preferences and cook from the pantry, or generate a new meal and add ingredients to your list?`;
      return c.json({ message, clarification });
    }

    if (mode === 'cook_from_pantry' && conflict.allergenConflicting.length === conflict.totalFoodItems) {
      await refundAI(c.env.DB, householdId, 1);
      return c.json({
        message: `I can't cook from the pantry safely — every item (${conflict.allergenConflicting.slice(0, 5).join(', ')}) contains allergens that I won't override. Please add some non-allergen items to your pantry, or generate a freely-created meal instead.`,
      });
    }
  }

  let response = await chatWithAI(c.env, pantryItems, partnerContext, history, userMessage, dietRules.promptBlock, dietRules.combinedClassifierTerms, dietRules.combinedRestrictedGroups, mode);

  if (mode === 'cook_from_pantry' && response.meal) {
    const validation = validateMealAgainstPantry(response.meal, pantryItems);
    if (!validation.isValid) {
      const pantrySummary = pantryItems.map((i) => i.name).filter(Boolean).slice(0, 30).join(', ');
      const retryMessage = `Your previous suggestion used ingredients that are NOT in our pantry: ${validation.violations.join(', ')}. Our pantry ONLY contains: ${pantrySummary || '(empty)'}. Please suggest a DIFFERENT meal using ONLY those pantry items plus free staples (water, salt, pepper, cooking oil, olive oil). If that is genuinely impossible, reply with a short message and do NOT include a meal object.`;
      const retryHistory = [
        ...history,
        { role: 'assistant' as const, content: response.message },
        { role: 'user' as const, content: retryMessage },
      ];
      const retryResponse = await chatWithAI(c.env, pantryItems, partnerContext, retryHistory, retryMessage, dietRules.promptBlock, dietRules.combinedClassifierTerms, dietRules.combinedRestrictedGroups, mode);

      if (retryResponse.meal) {
        const retryValidation = validateMealAgainstPantry(retryResponse.meal, pantryItems);
        if (retryValidation.isValid) {
          response = retryResponse;
        } else {
          const pantryList = pantryItems.map((i) => i.name).filter(Boolean).slice(0, 12).join(', ');
          return c.json({
            message: `I can't make a complete meal from just what's in your pantry${pantryList ? ` (${pantryList})` : ''} without adding other ingredients. Add a couple more items to your pantry, or tap "Suggest a meal — I'll shop" and I'll plan a meal plus your shopping list.`,
          });
        }
      } else {
        response = retryResponse;
      }
    }
  }

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

    try {
      const saved = await saveRecipe(c.env.DB, householdId, response.meal.name, JSON.stringify(response.meal));
      results.meal.savedRecipeId = saved.id;

      const generatedByName = profiles.find((p) => p.id === claims.partnerId)?.name;

      const doStub = c.env.HOUSEHOLD_SYNC.get(c.env.HOUSEHOLD_SYNC.idFromName(householdId));
      await doStub.fetch('https://do/meal-event', {
        method: 'POST',
        body: JSON.stringify({
          type: 'meal_generated',
          meal: response.meal,
          recipeId: saved.id,
          generatedBySlot: claims.slot,
          generatedByName,
          generatedByPartnerId: claims.partnerId,
          aiMessage: response.message,
          at: Date.now(),
        } satisfies import('../durable-objects/HouseholdSync').SyncEvent),
        headers: { 'content-type': 'application/json' },
      });
    } catch (err) {
      console.error('Failed to persist/broadcast generated meal:', err);
    }
  }

  return c.json(results);
}
