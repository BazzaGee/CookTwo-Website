import type { GeneratedMeal } from './ai';
import { tokenMatchesAllergen } from './ai';

export interface PantryCheckItem {
  name: string;
}

const FREE_STAPLES = [
  'water',
  'salt',
  'sea salt',
  'kosher salt',
  'pepper',
  'black pepper',
  'salt and pepper',
  'oil',
  'olive oil',
  'extra virgin olive oil',
  'vegetable oil',
  'cooking oil',
  'canola oil',
  'sunflower oil',
  'coconut oil',
  'cooking spray',
  'nonstick spray',
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isFreeStaple(name: string): boolean {
  const n = normalize(name);
  if (!n) return true;
  if (/\b(to taste|for serving|for garnish|as needed|optional|garnish)\b/.test(n)) return true;
  for (const staple of FREE_STAPLES) {
    if (n === staple) return true;
    const words = n.split(' ');
    if (words.length > 0 && words.every((w) => FREE_STAPLES.includes(w) || w === 'and')) return true;
  }
  return false;
}

export function isIngredientInPantry(name: string, pantryItems: PantryCheckItem[]): boolean {
  const ingredient = normalize(name);
  if (!ingredient) return true;
  for (const item of pantryItems) {
    const pantryName = normalize(item.name);
    if (!pantryName) continue;
    if (ingredient === pantryName) return true;
    if (tokenMatchesAllergen(ingredient, pantryName)) return true;
    if (tokenMatchesAllergen(pantryName, ingredient)) return true;
  }
  return false;
}

export interface PantryValidationResult {
  isValid: boolean;
  violations: string[];
}

export function validateMealAgainstPantry(
  meal: GeneratedMeal,
  pantryItems: PantryCheckItem[],
): PantryValidationResult {
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const ing of meal.ingredients ?? []) {
    const name = (ing?.name ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (isFreeStaple(name)) continue;
    if (isIngredientInPantry(name, pantryItems)) continue;
    violations.push(name);
  }
  return { isValid: violations.length === 0, violations };
}
