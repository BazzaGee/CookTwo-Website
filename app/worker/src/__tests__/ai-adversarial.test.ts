import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatWithAI, assertMealIsSafe, type GeneratedMeal, type PartnerContext } from '../lib/ai';
import type { TDEEResult } from '../lib/tdee';

const tdee: TDEEResult = { bmr: 1700, tdee: 2200, targetCalories: 1700 };

const testEnv = {
  AI_PROVIDER: 'deepseek',
  DEEPSEEK_KEY: 'test-key',
  ALIBABA_KEY: '',
  ZAI_KEY: '',
  OPENROUTER_KEY: '',
  DB: null as unknown as D1Database,
  DIET_RESEARCH: null as unknown as R2Bucket,
  HOUSEHOLD_SYNC: null as unknown as DurableObjectNamespace,
  INVITE_STORE: null as unknown as DurableObjectNamespace,
  JWT_SECRET: 'test',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  RESEND_API_KEY: '',
  RESEND_FROM: '',
  SITE_URL: '',
  PWA_URL: '',
};

function makeProfiles(overrides?: Partial<PartnerContext>): PartnerContext[] {
  return [{
    name: 'Alex',
    diet: 'vegan',
    allergens: ['shellfish'],
    tdee: null,
    goal: null,
    activityLevel: null,
    slot: 1,
    ...overrides,
  }];
}

describe('chatWithAI with mocked DeepSeek', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchResponse(body: object) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  it('returns a parsed meal when DeepSeek responds with valid JSON', async () => {
    mockFetchResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            message: 'How about Thai curry?',
            meal: {
              name: 'Thai Curry',
              description: 'Test meal',
              timeMinutes: 25,
              calories: 400,
              protein: 20,
              carbs: 40,
              fat: 15,
              ingredients: [{ name: 'tofu', have: true, quantity: '200g' }],
              steps: ['Cook'],
            },
            actions: { addToList: ['lime'] },
          }),
        },
      }],
    });

    const result = await chatWithAI(testEnv, [], makeProfiles(), [], 'Suggest a meal');
    expect(result.message).toBe('How about Thai curry?');
    expect(result.meal).toBeDefined();
    expect(result.meal!.name).toBe('Thai Curry');
    expect(result.actions?.addToList).toEqual(['lime']);
  });

  it('returns error message when AI call fails entirely', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await chatWithAI(testEnv, [], makeProfiles(), [], 'Suggest a meal');
    expect(result.message).toContain("couldn't reach the AI");
    expect(result.meal).toBeUndefined();
  });

  it('returns error message when AI returns empty response', async () => {
    mockFetchResponse({ choices: [{ message: { content: '' } }] });
    const result = await chatWithAI(testEnv, [], makeProfiles(), [], 'Suggest a meal');
    expect(result.message).toContain("couldn't reach the AI");
  });

  it('blocks a meal that violates allergen constraints', async () => {
    mockFetchResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            message: 'How about shrimp stir fry?',
            meal: {
              name: 'Shrimp Stir Fry',
              description: 'With shrimp and vegetables',
              timeMinutes: 20,
              calories: 350,
              protein: 25,
              carbs: 30,
              fat: 10,
              ingredients: [{ name: 'shrimp', have: false, quantity: '200g' }],
              steps: ['Cook shrimp with vegetables'],
            },
          }),
        },
      }],
    });

    const profiles = makeProfiles({ allergens: ['shellfish'] });
    const result = await chatWithAI(testEnv, [], profiles, [], 'Suggest something');
    expect(result.message).toContain('conflict with one or more partner allergies');
    expect(result.meal).toBeUndefined();
  });

  it('blocks a meal with cross-reactive ingredient (peanut oil)', async () => {
    mockFetchResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            message: 'How about noodles with peanut oil?',
            meal: {
              name: 'Peanut Noodles',
              description: 'Noodles in peanut oil',
              timeMinutes: 15,
              calories: 400,
              protein: 12,
              carbs: 50,
              fat: 18,
              ingredients: [{ name: 'noodles', have: true, quantity: '200g' }, { name: 'peanut oil', have: true, quantity: '2 tbsp' }],
              steps: ['Cook noodles, toss with peanut oil'],
            },
          }),
        },
      }],
    });

    const profiles = makeProfiles({ allergens: ['peanut'] });
    const result = await chatWithAI(testEnv, [], profiles, [], 'Suggest noodles');
    expect(result.message).toContain('conflict with one or more partner allergies');
    expect(result.meal).toBeUndefined();
  });

  it('passes through valid JSON when no allergen issues', async () => {
    mockFetchResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            message: 'Simple avocado toast works',
            meal: {
              name: 'Avocado Toast',
              description: 'Quick and nutritious',
              timeMinutes: 10,
              calories: 300,
              protein: 8,
              carbs: 30,
              fat: 18,
              ingredients: [{ name: 'bread', have: true, quantity: '2 slices' }, { name: 'avocado', have: true, quantity: '1' }],
              steps: ['Toast bread, mash avocado on top'],
            },
          }),
        },
      }],
    });

    const profiles = makeProfiles({ allergens: ['shellfish'] });
    const result = await chatWithAI(testEnv, [], profiles, [], 'Suggest breakfast');
    expect(result.meal).toBeDefined();
    expect(result.meal!.name).toBe('Avocado Toast');
  });

  it('parse strategy 2: strips markdown code blocks', async () => {
    mockFetchResponse({
      choices: [{
        message: {
          content: "```json\n{\n  \"message\": \"Try pasta\",\n  \"meal\": {\n    \"name\": \"Pasta\",\n    \"description\": \"Simple\",\n    \"timeMinutes\": 15,\n    \"calories\": 400,\n    \"protein\": 15,\n    \"carbs\": 50,\n    \"fat\": 12,\n    \"ingredients\": [{\"name\": \"pasta\", \"have\": true, \"quantity\": \"200g\"}],\n    \"steps\": [\"Boil and serve\"]\n  }\n}\n```",
        },
      }],
    });

    const result = await chatWithAI(testEnv, [], makeProfiles([]), [], 'Suggest pasta');
    expect(result.meal).toBeDefined();
    expect(result.meal!.name).toBe('Pasta');
  });

  it('parse strategy 3: plain text fallback when no JSON', async () => {
    mockFetchResponse({
      choices: [{
        message: { content: 'Sorry, I cannot suggest a meal right now.' },
      }],
    });

    const result = await chatWithAI(testEnv, [], makeProfiles(), [], 'test');
    expect(result.message).toBe('Sorry, I cannot suggest a meal right now.');
    expect(result.meal).toBeUndefined();
  });
});

describe('assertMealIsSafe - dietary restrictions', () => {
  it('blocks a non-vegan ingredient when partner is vegan', () => {
    const meal: GeneratedMeal = {
      name: 'Chicken Salad', description: '', timeMinutes: 10,
      calories: 300, protein: 30, carbs: 10, fat: 15,
      ingredients: [{ name: 'chicken breast', have: true, quantity: '200g' }],
      steps: ['Grill chicken'],
    };
    const profiles = [{
      name: 'Vegan', diet: 'vegan' as Diet, allergens: [], tdee: null, goal: null, activityLevel: null, slot: 1 as const,
    }];
    expect(assertMealIsSafe(meal, profiles)).toBe(true);
  });
});
