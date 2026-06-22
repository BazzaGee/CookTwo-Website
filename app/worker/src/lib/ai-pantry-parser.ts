import type { Category } from '../durable-objects/HouseholdSync';

export interface ParsedPantryItem {
  name: string;
  quantityValue: number | null;
  quantityUnit: string;
  brand: string;
  category: Category;
  isFood: boolean;
  confidence: number;
  needsReview: boolean;
}

const AI_PARSING_PROMPT = `You are a grocery item parser for a couples' cooking app. Extract structured data from raw text input.

Categories (use EXACTLY one of these):
- Produce: fresh fruit, fresh vegetables, frozen vegetables, frozen fruit, herbs, salad greens
- Meat: raw meat, poultry, fish, seafood, deli meats, sausages, bacon
- Dairy: milk, cheese, yogurt, butter, cream, eggs, dairy alternatives (almond milk etc.)
- Pantry: dry goods, condiments, sauces, spices, baking supplies, bread, wraps, snacks, nuts, oils, pasta, rice, cereal, preserves, spreads, frozen processed foods (frozen pizza, frozen meals)
- Household: cleaning products, paper goods, bin bags, kitchen supplies, light bulbs, batteries, garden supplies
- Personal Care: toiletries, hygiene products, medications, vitamins, first aid, baby care, feminine hygiene

For each item, return:
- name: The core product name (lowercase, e.g., "milk", "cheddar", "onion")
- quantityValue: Numeric amount (e.g., 1, 250, 0.5) or null if not specified
- quantityUnit: Unit of measurement (e.g., "litre", "g", "cup", "piece", "punnet") or ""
- brand: Brand name if detected (e.g., "Organic", "Watties") or ""
- category: One of the 7 categories above
- isFood: true if this is something you eat or cook with, false for cleaning/hygiene/other non-food
- confidence: 0-1 score
- needsReview: false

Examples:
Input: "strawberries 2 punnets"
Output: {"name":"strawberries","quantityValue":2,"quantityUnit":"punnet","brand":"","category":"Produce","isFood":true,"confidence":0.95,"needsReview":false}

Input: "frozen mixed vegetables 1 kg"
Output: {"name":"frozen mixed vegetables","quantityValue":1,"quantityUnit":"kg","brand":"","category":"Produce","isFood":true,"confidence":0.9,"needsReview":false}

Input: "shampoo"
Output: {"name":"shampoo","quantityValue":null,"quantityUnit":"","brand":"","category":"Personal Care","isFood":false,"confidence":0.95,"needsReview":false}

Input: "toilet paper 4 rolls"
Output: {"name":"toilet paper","quantityValue":4,"quantityUnit":"roll","brand":"","category":"Personal Care","isFood":false,"confidence":0.95,"needsReview":false}

Input: "wraps"
Output: {"name":"wraps","quantityValue":null,"quantityUnit":"","brand":"","category":"Pantry","isFood":true,"confidence":0.9,"needsReview":false}

Input: "mayonnaise"
Output: {"name":"mayonnaise","quantityValue":null,"quantityUnit":"","brand":"","category":"Pantry","isFood":true,"confidence":0.9,"needsReview":false}

Input: "frozen chips"
Output: {"name":"frozen chips","quantityValue":null,"quantityUnit":"","brand":"","category":"Produce","isFood":true,"confidence":0.85,"needsReview":false}

Input: "almonds 250g"
Output: {"name":"almonds","quantityValue":250,"quantityUnit":"g","brand":"","category":"Pantry","isFood":true,"confidence":0.95,"needsReview":false}

Input: "dish soap"
Output: {"name":"dish soap","quantityValue":null,"quantityUnit":"","brand":"","category":"Household","isFood":false,"confidence":0.95,"needsReview":false}

Input: "250g Swiss cheddar"
Output: {"name":"cheddar","quantityValue":250,"quantityUnit":"g","brand":"Swiss","category":"Dairy","isFood":true,"confidence":0.9,"needsReview":false}

Output ONLY a valid JSON array, no markdown, no explanation.`;

const PANTRY_MODEL_CHAIN = ['deepseek-v4-flash'] as const;

export async function parsePantryWithAI(
  rawInputs: string[],
  apiKey: string,
  provider: 'deepseek' | 'alibaba' | 'zai' = 'deepseek',
  envProviderConfig?: { baseUrl: string; authHeader: string; authPrefix: string },
): Promise<ParsedPantryItem[]> {
  const prompt = `${AI_PARSING_PROMPT}\n\nInput: ${JSON.stringify(rawInputs)}`;

  let baseUrl = 'https://api.deepseek.com/chat/completions';
  let authHeader = 'Authorization';
  let authPrefix = 'Bearer';

  if (envProviderConfig) {
    baseUrl = envProviderConfig.baseUrl;
    authHeader = envProviderConfig.authHeader;
    authPrefix = envProviderConfig.authPrefix;
  }

  for (const model of PANTRY_MODEL_CHAIN) {
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [authHeader]: `${authPrefix} ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
          thinking: { type: 'disabled' },
        }),
      });

      if (!res.ok) {
        console.error(`AI API error for model ${model}: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      const text = data.choices?.[0]?.message?.content ?? '';

      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ParsedPantryItem[];
          console.log(`Pantry parsed using model: ${model}`);
          return parsed.map((item) => ({
            ...item,
            name: (item.name || '').trim(),
            category: isValidCategory(item.category) ? item.category : 'Pantry',
            isFood: typeof item.isFood === 'boolean' ? item.isFood : true,
            confidence: Math.min(Math.max(item.confidence ?? 0.5, 0), 1),
            needsReview: false,
          }));
        }
      } catch {
        console.error(`Failed to parse AI response from model ${model}:`, text.substring(0, 200));
      }
    } catch (err) {
      console.error(`Pantry parse model ${model} failed:`, err);
    }
  }

  console.error('All pantry parse models failed. Using fallback.');
  return rawInputs.map(fallbackItem);
}

function fallbackItem(input: string): ParsedPantryItem {
  return {
    name: input,
    quantityValue: null,
    quantityUnit: '',
    brand: '',
    category: 'Pantry' as Category,
    isFood: true,
    confidence: 0.3,
    needsReview: true,
  };
}

function isValidCategory(value: string): value is Category {
  return ['Produce', 'Meat', 'Dairy', 'Pantry', 'Household', 'Personal Care'].includes(value);
}
