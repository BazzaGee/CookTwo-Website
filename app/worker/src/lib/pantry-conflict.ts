import { CROSS_REACTIVE_MAP, tokenMatchesAllergen } from './ai';

export interface PantryItemInput {
  name: string;
  category?: string;
  isFood?: boolean;
}

export interface PantryConflictResult {
  totalFoodItems: number;
  allergenConflicting: string[];
  dietConflicting: string[];
  safe: string[];
  hasAllergenConflict: boolean;
  hasDietConflict: boolean;
}

function buildForbiddenTerms(allergens: string[]): Set<string> {
  const forbidden = new Set<string>();
  for (const raw of allergens) {
    const a = raw.trim().toLowerCase();
    if (!a) continue;
    forbidden.add(a);
    const crossReactive = CROSS_REACTIVE_MAP[a];
    if (crossReactive) {
      for (const cr of crossReactive) forbidden.add(cr.toLowerCase());
    }
  }
  return forbidden;
}

function matchesAnyTerm(itemName: string, terms: Set<string>): boolean {
  const lower = itemName.toLowerCase();
  for (const term of terms) {
    if (tokenMatchesAllergen(lower, term)) return true;
  }
  return false;
}

function classifyItemAgainstDiet(
  itemName: string,
  classifierTerms: Record<string, string>,
  restrictedGroups: Set<string>,
): boolean {
  if (restrictedGroups.size === 0 || Object.keys(classifierTerms).length === 0) return false;
  const lower = itemName.toLowerCase();
  for (const [ingredient, foodGroup] of Object.entries(classifierTerms)) {
    if (restrictedGroups.has(foodGroup) && tokenMatchesAllergen(lower, ingredient.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function detectPantryConflict(
  pantryItems: PantryItemInput[],
  allergens: string[],
  classifierTerms: Record<string, string>,
  restrictedGroups: Set<string>,
): PantryConflictResult {
  const foodItems = pantryItems.filter((i) => i.isFood !== false);
  const forbidden = buildForbiddenTerms(allergens);

  const allergenConflicting: string[] = [];
  const dietConflicting: string[] = [];
  const safe: string[] = [];

  for (const item of foodItems) {
    const name = item.name.trim();
    if (!name) continue;

    if (forbidden.size > 0 && matchesAnyTerm(name, forbidden)) {
      allergenConflicting.push(name);
      continue;
    }

    if (classifyItemAgainstDiet(name, classifierTerms, restrictedGroups)) {
      dietConflicting.push(name);
      continue;
    }

    safe.push(name);
  }

  return {
    totalFoodItems: foodItems.length,
    allergenConflicting,
    dietConflicting,
    safe,
    hasAllergenConflict: allergenConflicting.length > 0,
    hasDietConflict: dietConflicting.length > 0,
  };
}
