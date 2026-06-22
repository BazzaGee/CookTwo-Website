import { describe, it, expect } from 'vitest';
import { isFreeStaple, isIngredientInPantry, validateMealAgainstPantry } from '../lib/pantry-match';
import type { GeneratedMeal } from '../lib/ai';

function makeMeal(ingredients: string[]): GeneratedMeal {
  return {
    name: 'Test Meal',
    description: '',
    timeMinutes: 10,
    calories: 100,
    protein: 1,
    carbs: 1,
    fat: 1,
    ingredients: ingredients.map((n) => ({ name: n, have: true, quantity: '1' })),
    steps: [],
  };
}

describe('isFreeStaple', () => {
  it('treats water, salt, pepper and oils as free staples', () => {
    expect(isFreeStaple('water')).toBe(true);
    expect(isFreeStaple('salt')).toBe(true);
    expect(isFreeStaple('Olive Oil')).toBe(true);
    expect(isFreeStaple('black pepper')).toBe(true);
    expect(isFreeStaple('cooking oil')).toBe(true);
  });

  it('treats "to taste" / "for serving" qualifiers as free', () => {
    expect(isFreeStaple('salt to taste')).toBe(true);
    expect(isFreeStaple('parsley for garnish')).toBe(true);
  });

  it('does not treat real ingredients as free', () => {
    expect(isFreeStaple('chicken')).toBe(false);
    expect(isFreeStaple('rice')).toBe(false);
    expect(isFreeStaple('salmon')).toBe(false);
  });
});

describe('isIngredientInPantry', () => {
  it('matches exact pantry items case-insensitively', () => {
    expect(isIngredientInPantry('Chicken', [{ name: 'chicken' }])).toBe(true);
  });

  it('matches when the pantry item is a base of the ingredient', () => {
    expect(isIngredientInPantry('chicken breast', [{ name: 'chicken' }])).toBe(true);
    expect(isIngredientInPantry('jasmine rice', [{ name: 'rice' }])).toBe(true);
  });

  it('returns false when the ingredient is genuinely absent', () => {
    expect(isIngredientInPantry('salmon', [{ name: 'chicken' }, { name: 'rice' }])).toBe(false);
  });
});

describe('validateMealAgainstPantry', () => {
  it('passes when every ingredient is in the pantry or a free staple', () => {
    const meal = makeMeal(['chicken', 'rice', 'olive oil', 'salt', 'black pepper']);
    const result = validateMealAgainstPantry(meal, [{ name: 'chicken' }, { name: 'rice' }]);
    expect(result.isValid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('flags ingredients that are neither in the pantry nor free staples', () => {
    const meal = makeMeal(['chicken', 'salmon', 'soy sauce', 'olive oil']);
    const result = validateMealAgainstPantry(meal, [{ name: 'chicken' }]);
    expect(result.isValid).toBe(false);
    expect(result.violations).toEqual(['salmon', 'soy sauce']);
  });

  it('rejects a meal full of items the user does not own', () => {
    const meal = makeMeal(['pasta', 'tomato sauce', 'basil', 'parmesan']);
    const result = validateMealAgainstPantry(meal, [{ name: 'eggs' }]);
    expect(result.isValid).toBe(false);
    expect(result.violations).toHaveLength(4);
  });

  it('passes for a meal built entirely from pantry items', () => {
    const meal = makeMeal(['eggs', 'cheese', 'butter']);
    const result = validateMealAgainstPantry(meal, [{ name: 'eggs' }, { name: 'cheese' }, { name: 'butter' }]);
    expect(result.isValid).toBe(true);
  });

  it('deduplicates repeated violations', () => {
    const meal = makeMeal(['salmon', 'salmon', 'dill']);
    const result = validateMealAgainstPantry(meal, []);
    expect(result.violations).toEqual(['salmon', 'dill']);
  });
});
