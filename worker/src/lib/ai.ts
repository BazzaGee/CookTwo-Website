import type { Env } from '../env';
import type { Diet } from '../routes/profiles';
import type { TDEEResult } from '../lib/tdee';

export interface MealIngredient {
  name: string;
  have: boolean;
  quantity: string;
}

export interface PlatingInstruction {
  partnerSlot: 1 | 2;
  partnerName: string;
  targetCalories: number;
  plate: string;
  protein: number;
  carbs: number;
  fat: number;
}

export interface GeneratedMeal {
  name: string;
  description: string;
  timeMinutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: MealIngredient[];
  steps: string[];
  plating?: PlatingInstruction[];
}

const MOCK_MEALS: GeneratedMeal[] = [
  {
    name: 'Chicken Stir-Fry',
    description: 'Quick and flavorful stir-fry with tender chicken, crisp vegetables, and a savory garlic-soy glaze over steamed rice.',
    timeMinutes: 25,
    calories: 580,
    protein: 42,
    carbs: 55,
    fat: 18,
    ingredients: [
      { name: 'chicken breast', have: true, quantity: '1 lb' },
      { name: 'white rice', have: true, quantity: '1 cup' },
      { name: 'spinach', have: true, quantity: '2 cups' },
      { name: 'onion', have: true, quantity: '1 medium' },
      { name: 'garlic', have: true, quantity: '3 cloves' },
      { name: 'soy sauce', have: false, quantity: '2 tbsp' },
      { name: 'sesame oil', have: false, quantity: '1 tbsp' },
    ],
    steps: [
      'Cook rice according to package directions.',
      'Slice chicken into thin strips. Mince garlic, slice onion.',
      'Heat sesame oil in a wok or large pan over high heat.',
      'Add chicken, cook 4-5 min until golden.',
      'Add onion and garlic, stir-fry 2 min.',
      'Add spinach, cook until wilted (1 min).',
      'Add soy sauce, toss to coat.',
      'Serve over rice.',
    ],
  },
  {
    name: 'Garlic Chicken with Rice and Greens',
    description: 'Simple, comforting one-pan meal with golden garlic chicken, fluffy rice, and wilted spinach.',
    timeMinutes: 30,
    calories: 520,
    protein: 38,
    carbs: 48,
    fat: 16,
    ingredients: [
      { name: 'chicken breast', have: true, quantity: '1 lb' },
      { name: 'white rice', have: true, quantity: '1.5 cups' },
      { name: 'spinach', have: true, quantity: '3 cups' },
      { name: 'garlic', have: true, quantity: '4 cloves' },
      { name: 'olive oil', have: true, quantity: '2 tbsp' },
      { name: 'lemon', have: false, quantity: '1' },
    ],
    steps: [
      'Cook rice with a pinch of salt.',
      'Season chicken with salt and pepper.',
      'Heat olive oil in a pan, cook chicken 6 min per side.',
      'Add minced garlic, cook 1 min until fragrant.',
      'Add spinach, cover, steam 2 min.',
      'Squeeze lemon over everything.',
      'Serve chicken and greens over rice.',
    ],
  },
  {
    name: 'Chicken Fried Rice',
    description: 'Better than takeout — day-old rice tossed with chicken, egg, and vegetables in a hot wok.',
    timeMinutes: 20,
    calories: 490,
    protein: 35,
    carbs: 52,
    fat: 14,
    ingredients: [
      { name: 'chicken breast', have: true, quantity: '0.5 lb' },
      { name: 'white rice', have: true, quantity: '2 cups cooked' },
      { name: 'onion', have: true, quantity: '1 small' },
      { name: 'garlic', have: true, quantity: '2 cloves' },
      { name: 'eggs', have: false, quantity: '2' },
      { name: 'soy sauce', have: false, quantity: '2 tbsp' },
    ],
    steps: [
      'Dice chicken into small cubes.',
      'Heat oil in a wok, scramble eggs, set aside.',
      'Cook chicken until golden, set aside.',
      'Sauté onion and garlic.',
      'Add cold rice, stir-fry 3 min.',
      'Return chicken and eggs, add soy sauce.',
      'Toss everything together, serve hot.',
    ],
  },
];

const MODEL_CHAINS = {
  alibaba: ['qwen3.5-plus', 'qwen3.6-plus', 'moonshotai/kimi-k2.5'],
  zai: ['glm-5.1', 'glm-5', 'glm-5-turbo'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
} as const;

const PROVIDER_CONFIG = {
  alibaba: {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer',
    secretRef: 'ALIBABA_KEY',
  },
  zai: {
    baseUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer',
    secretRef: 'ZAI_KEY',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer',
    secretRef: 'DEEPSEEK_KEY',
  },
} as const;

function buildPrompt(
  pantryItems: Array<{ name: string; quantity: string; category?: string; quantityValue?: number | null; quantityUnit?: string; brand?: string }>,
  partner1Diet: Diet,
  partner2Diet: Diet,
  partner1Body?: { name: string; tdee: TDEEResult },
  partner2Body?: { name: string; tdee: TDEEResult },
): string {
  const pantryList = pantryItems.map((i) => {
    const qty = i.quantityValue && i.quantityUnit ? `${i.quantityValue} ${i.quantityUnit}` : (i.quantity || '');
    const cat = i.category ? `, ${i.category}` : '';
    const brand = i.brand ? `, ${i.brand}` : '';
    return `${i.name}${qty ? ` (${qty}${cat}${brand})` : (cat || brand ? ` (${cat}${brand})` : '')}`;
  }).join(', ') || 'none listed';

  if (partner1Body && partner2Body) {
    return `You are an adaptive meal planner for couples who cook together but have different nutritional goals.

Pantry: ${pantryList}
Partner 1: ${partner1Body.name}, diet=${partner1Diet}, target=${partner1Body.tdee.targetCalories} cal/day
Partner 2: ${partner2Body.name}, diet=${partner2Diet}, target=${partner2Body.tdee.targetCalories} cal/day
Time limit: 30 minutes

Generate ONE shared recipe with TWO different plating instructions. Same cooking process, different portions.

Rules:
- The meal must work for BOTH dietary preferences
- Prioritize using pantry ingredients
- Give specific portion sizes for each partner's plate
- Output ONLY valid JSON, no markdown, no explanation

JSON format:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "timeMinutes": 25,
  "calories": 500,
  "protein": 35,
  "carbs": 45,
  "fat": 15,
  "ingredients": [
    {"name": "ingredient", "have": true, "quantity": "1 cup"},
    {"name": "missing", "have": false, "quantity": "2 tbsp"}
  ],
  "steps": ["Step 1", "Step 2"],
  "plating": [
    {"partnerSlot": 1, "partnerName": "${partner1Body.name}", "targetCalories": ${partner1Body.tdee.targetCalories}, "plate": "4oz chicken over greens, 1/2 cup rice", "protein": 35, "carbs": 30, "fat": 12},
    {"partnerSlot": 2, "partnerName": "${partner2Body.name}", "targetCalories": ${partner2Body.tdee.targetCalories}, "plate": "6oz chicken, 1 cup rice, side vegetables", "protein": 50, "carbs": 55, "fat": 15}
  ]
}`;
  }

  return `You are a meal planner for couples. Generate ONE dinner suggestion based on what they have.

Pantry: ${pantryList}
Partner 1 diet: ${partner1Diet}
Partner 2 diet: ${partner2Diet}
Time limit: 30 minutes

Rules:
- The meal must work for BOTH dietary preferences (if one is vegetarian, the meal must be vegetarian)
- Prioritize using pantry ingredients
- Keep it simple and realistic
- Output ONLY valid JSON, no markdown, no explanation

JSON format:
{
  "name": "Recipe Name",
  "description": "Brief appetizing description",
  "timeMinutes": 25,
  "calories": 500,
  "protein": 35,
  "carbs": 45,
  "fat": 15,
  "ingredients": [
    {"name": "ingredient name", "have": true, "quantity": "1 cup"},
    {"name": "missing ingredient", "have": false, "quantity": "2 tbsp"}
  ],
  "steps": ["Step 1", "Step 2", "Step 3"]
}`;
}

async function callProvider(
  env: Env,
  provider: 'alibaba' | 'zai' | 'deepseek',
  model: string,
  prompt: string,
): Promise<GeneratedMeal | null> {
  const config = PROVIDER_CONFIG[provider];
  const apiKey = (env as unknown as Record<string, unknown>)[config.secretRef] as string;

  if (!apiKey) {
    console.error(`Missing API key for provider ${provider}: ${config.secretRef}`);
    return null;
  }

  const res = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [config.authHeader]: `${config.authPrefix} ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1536,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error(`Provider ${provider} call failed for model ${model}: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as GeneratedMeal;
    }
  } catch {
    console.error(`Failed to parse AI response from model ${model}`);
  }

  return null;
}

export async function generateMeal(
  env: Env,
  pantryItems: Array<{ name: string; quantity: string }>,
  partner1Diet: Diet,
  partner2Diet: Diet,
  partner1Body?: { name: string; tdee: TDEEResult },
  partner2Body?: { name: string; tdee: TDEEResult },
): Promise<GeneratedMeal> {
  const provider = (env.AI_PROVIDER || 'deepseek') as keyof typeof MODEL_CHAINS;
  const models = MODEL_CHAINS[provider] || MODEL_CHAINS.deepseek;
  const prompt = buildPrompt(pantryItems, partner1Diet, partner2Diet, partner1Body, partner2Body);

  for (const model of models) {
    try {
      const meal = await callProvider(env, provider as 'alibaba' | 'zai' | 'deepseek', model, prompt);
      if (meal) {
        console.log(`AI meal generated using model: ${model} (provider: ${provider})`);
        if (partner1Body && partner2Body && !meal.plating) {
          meal.plating = [
            {
              partnerSlot: 1,
              partnerName: partner1Body.name,
              targetCalories: partner1Body.tdee.targetCalories,
              plate: `${Math.round(partner1Body.tdee.targetCalories * 0.4 / 4)}oz protein over greens, ${Math.round(partner1Body.tdee.targetCalories * 0.3 / 200)}/2 cup rice`,
              protein: Math.round(partner1Body.tdee.targetCalories * 0.3 / 4),
              carbs: Math.round(partner1Body.tdee.targetCalories * 0.4 / 4),
              fat: Math.round(partner1Body.tdee.targetCalories * 0.3 / 9),
            },
            {
              partnerSlot: 2,
              partnerName: partner2Body.name,
              targetCalories: partner2Body.tdee.targetCalories,
              plate: `${Math.round(partner2Body.tdee.targetCalories * 0.4 / 4)}oz protein, ${Math.round(partner2Body.tdee.targetCalories * 0.35 / 200)} cup rice, side vegetables`,
              protein: Math.round(partner2Body.tdee.targetCalories * 0.35 / 4),
              carbs: Math.round(partner2Body.tdee.targetCalories * 0.4 / 4),
              fat: Math.round(partner2Body.tdee.targetCalories * 0.25 / 9),
            },
          ];
        }
        return meal;
      }
    } catch (err) {
      console.error(`Model ${model} failed:`, err);
    }
  }

  console.log(`All AI models failed for provider ${provider}, falling back to mock meal`);
  return generateMock(pantryItems, partner1Diet, partner2Diet, partner1Body, partner2Body);
}

function generateMock(
  pantryItems: Array<{ name: string; quantity: string }>,
  _partner1Diet: Diet,
  _partner2Diet: Diet,
  partner1Body?: { name: string; tdee: TDEEResult },
  partner2Body?: { name: string; tdee: TDEEResult },
): GeneratedMeal {
  const pantryNames = pantryItems.map((i) => i.name.toLowerCase());
  const hasChicken = pantryNames.some((n) => n.includes('chicken'));
  const hasRice = pantryNames.some((n) => n.includes('rice'));

  const fallback = MOCK_MEALS[0]!;

  let meal: GeneratedMeal;
  if (hasChicken && hasRice) {
    meal = MOCK_MEALS[0]!;
  } else if (hasChicken) {
    meal = MOCK_MEALS[1]!;
  } else if (hasRice) {
    meal = MOCK_MEALS[2]!;
  } else {
    meal = fallback;
  }

  if (partner1Body && partner2Body) {
    meal = {
      ...meal,
      plating: [
        {
          partnerSlot: 1,
          partnerName: partner1Body.name,
          targetCalories: partner1Body.tdee.targetCalories,
          plate: `${Math.round(partner1Body.tdee.targetCalories * 0.4 / 4)}oz protein over greens, ${Math.round(partner1Body.tdee.targetCalories * 0.3 / 200)}/2 cup rice`,
          protein: Math.round(partner1Body.tdee.targetCalories * 0.3 / 4),
          carbs: Math.round(partner1Body.tdee.targetCalories * 0.4 / 4),
          fat: Math.round(partner1Body.tdee.targetCalories * 0.3 / 9),
        },
        {
          partnerSlot: 2,
          partnerName: partner2Body.name,
          targetCalories: partner2Body.tdee.targetCalories,
          plate: `${Math.round(partner2Body.tdee.targetCalories * 0.4 / 4)}oz protein, ${Math.round(partner2Body.tdee.targetCalories * 0.35 / 200)} cup rice, side vegetables`,
          protein: Math.round(partner2Body.tdee.targetCalories * 0.35 / 4),
          carbs: Math.round(partner2Body.tdee.targetCalories * 0.4 / 4),
          fat: Math.round(partner2Body.tdee.targetCalories * 0.25 / 9),
        },
      ],
    };
  }

  return meal;
}

export interface ChatResponse {
  message: string;
  meal?: GeneratedMeal;
  actions?: {
    addToPantry?: string[];
    addToList?: string[];
  };
}

interface PartnerContext {
  name: string;
  diet: Diet;
  allergies: string;
  tdee: TDEEResult | null;
  slot: 1 | 2;
}

function buildChatSystemPrompt(
  pantryItems: Array<{ name: string; quantity: string; category?: string; quantityValue?: number | null; quantityUnit?: string }>,
  profiles: PartnerContext[],
): string {
  const pantryList = pantryItems.map((i) => {
    const qty = i.quantityValue && i.quantityUnit ? `${i.quantityValue} ${i.quantityUnit}` : (i.quantity || '');
    const cat = i.category ? `, ${i.category}` : '';
    return `${i.name}${qty ? ` (${qty}${cat})` : (cat ? ` (${cat})` : '')}`;
  }).join(', ') || 'empty';

  const p1 = profiles.find((p) => p.slot === 1);
  const p2 = profiles.find((p) => p.slot === 2);

  const p1Line = p1
    ? `Partner 1: ${p1.name}, diet=${p1.diet}${p1.allergies ? `, allergies=${p1.allergies}` : ''}${p1.tdee ? `, target=${p1.tdee.targetCalories} cal/day` : ''}`
    : 'Partner 1: no profile set';
  const p2Line = p2
    ? `Partner 2: ${p2.name}, diet=${p2.diet}${p2.allergies ? `, allergies=${p2.allergies}` : ''}${p2.tdee ? `, target=${p2.tdee.targetCalories} cal/day` : ''}`
    : 'Partner 2: no profile set';

  const hasBothTdee = p1?.tdee && p2?.tdee;

  return `You are Cupla's meal planner for couples. Your job is to help them decide what to cook together based on what they have and what they need.

Pantry: ${pantryList}
${p1Line}
${p2Line}

Rules:
- Be concise and direct. No greetings, no filler, no small talk. Get to the point.
- Prioritize using pantry ingredients. When listing ingredients, mark have=true if in pantry, have=false if missing.
- If the user's request is vague and you need to decide between multiple good options, ask ONE brief question (cuisine preference? time limit? spice level?).
- When you suggest a meal, include the full meal object in your response.
- If ingredients are missing, put them in addToList so the user can buy them.
- If the user says they bought something or have it, put it in addToPantry.
- Every meal must work for BOTH partners' dietary requirements. If one is vegetarian, the meal is vegetarian.
- Keep total cook time under 30 minutes unless the user asks for something specific.
${hasBothTdee ? `- When both partners have calorie targets, include plating instructions with different portion sizes for each partner.\n- Use the same recipe but adjust quantities so each person hits their target calories.` : ''}

Response format — you MUST respond with valid JSON only, no markdown:
{
  "message": "Your response to the user (2-3 sentences max, be direct)",
  "meal": {
    "name": "Recipe Name",
    "description": "Brief appetizing description",
    "timeMinutes": 25,
    "calories": 500,
    "protein": 35,
    "carbs": 45,
    "fat": 15,
    "ingredients": [
      {"name": "ingredient name", "have": true, "quantity": "1 cup"},
      {"name": "missing ingredient", "have": false, "quantity": "2 tbsp"}
    ],
    "steps": ["Step 1", "Step 2", "Step 3"]${hasBothTdee ? `,
    "plating": [
      {"partnerSlot": 1, "partnerName": "${p1?.name ?? 'Partner 1'}", "targetCalories": ${p1?.tdee?.targetCalories ?? 0}, "plate": "4oz protein over greens, 1/2 cup rice", "protein": 35, "carbs": 30, "fat": 12},
      {"partnerSlot": 2, "partnerName": "${p2?.name ?? 'Partner 2'}", "targetCalories": ${p2?.tdee?.targetCalories ?? 0}, "plate": "6oz protein, 1 cup rice, side vegetables", "protein": 50, "carbs": 55, "fat": 15}
    ]` : ''}
  },
  "actions": {
    "addToPantry": ["item they just bought"],
    "addToList": ["item they need to buy"]
  }
}

Only include "meal" when you are suggesting a specific recipe. Only include "actions" when there are items to add. If you are just asking a question or clarifying, only include "message".`;
}

async function callDeepSeekChat(
  env: Env,
  systemPrompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
): Promise<string | null> {
  const provider = (env.AI_PROVIDER || 'deepseek') as keyof typeof MODEL_CHAINS;
  const models = MODEL_CHAINS[provider] || MODEL_CHAINS.deepseek;

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  for (const model of models) {
    try {
      const config = PROVIDER_CONFIG[provider as 'alibaba' | 'zai' | 'deepseek'];
      const apiKey = (env as unknown as Record<string, unknown>)[config.secretRef] as string;

      if (!apiKey) {
        console.error(`Missing API key for ${provider}: ${config.secretRef}`);
        continue;
      }

      const res = await fetch(config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [config.authHeader]: `${config.authPrefix} ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages,
        }),
      });

      if (!res.ok) {
        console.error(`Chat call failed for model ${model}: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      const text = data.choices?.[0]?.message?.content ?? '';
      if (text) return text;
    } catch (err) {
      console.error(`Chat model ${model} failed:`, err);
    }
  }

  return null;
}

export async function chatWithAI(
  env: Env,
  pantryItems: Array<{ name: string; quantity: string; category?: string; quantityValue?: number | null; quantityUnit?: string }>,
  profiles: PartnerContext[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
): Promise<ChatResponse> {
  const systemPrompt = buildChatSystemPrompt(pantryItems, profiles);
  const raw = await callDeepSeekChat(env, systemPrompt, history, userMessage);

  if (!raw) {
    return { message: 'I couldn\'t generate a response right now. Try again in a moment.' };
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ChatResponse;
      if (parsed.message && typeof parsed.message === 'string') {
        return parsed;
      }
    }
  } catch {
    console.error('Failed to parse chat AI response');
  }

  return { message: raw };
}
