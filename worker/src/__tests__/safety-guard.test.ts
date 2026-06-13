import { describe, it, expect, beforeEach } from 'vitest';
import { assertMealIsSafe, type GeneratedMeal, type PartnerContext } from '../lib/ai';

const safeMeal: GeneratedMeal = {
  name: 'Chicken and Rice Bowl',
  description: 'Simple and nutritious',
  timeMinutes: 25,
  calories: 500,
  protein: 35,
  carbs: 45,
  fat: 15,
  ingredients: [
    { name: 'chicken breast', have: true, quantity: '200g' },
    { name: 'rice', have: true, quantity: '1 cup' },
    { name: 'olive oil', have: true, quantity: '1 tbsp' },
  ],
  steps: ['Cook rice', 'Pan fry chicken with olive oil', 'Serve'],
};

function makeContext(allergens: string[] = []): PartnerContext[] {
  return [{
    name: 'Alex',
    diet: 'omnivore',
    allergens,
    tdee: null,
    goal: null,
    activityLevel: null,
    slot: 1,
  }];
}

describe('assertMealIsSafe', () => {
  it('returns true when there are no allergens', () => {
    const profiles = makeContext([]);
    expect(assertMealIsSafe(safeMeal, profiles)).toBe(true);
  });

  it('returns true when meal does not contain any allergens', () => {
    const profiles = makeContext(['shellfish']);
    expect(assertMealIsSafe(safeMeal, profiles)).toBe(true);
  });

  it('returns false when a meal ingredient matches an allergen', () => {
    const pnMeal: GeneratedMeal = {
      ...safeMeal,
      name: 'Spicy Peanut Noodles',
      ingredients: [{ name: 'peanut butter', have: true, quantity: '2 tbsp' }],
      steps: ['Mix peanut butter with noodles'],
    };
    const profiles = makeContext(['peanut']);
    expect(assertMealIsSafe(pnMeal, profiles)).toBe(false);
  });

  it('returns false when a meal step mentions an allergen derivative', () => {
    const peanutMeal: GeneratedMeal = {
      ...safeMeal,
      ingredients: [
        { name: 'tofu', have: true, quantity: '200g' },
        { name: 'vegetables', have: true, quantity: '1 cup' },
      ],
      steps: ['Stir fry vegetables in peanut oil', 'Serve over rice'],
    };
    const profiles = makeContext(['peanut']);
    expect(assertMealIsSafe(peanutMeal, profiles)).toBe(false);
  });

  it('returns false when meal description mentions a cross-reactive item', () => {
    const shrimpMeal: GeneratedMeal = {
      ...safeMeal,
      name: 'Shrimp Stir Fry',
      description: 'Fresh shrimp with vegetables',
      ingredients: [{ name: 'shrimp', have: true, quantity: '200g' }],
      steps: ['Cook shrimp', 'Serve'],
    };
    const profiles = makeContext(['shellfish']);
    expect(assertMealIsSafe(shrimpMeal, profiles)).toBe(false);
  });

  it('returns false when plating instruction mentions an allergen', () => {
    const dairyMeal: GeneratedMeal = {
      ...safeMeal,
      name: 'Pasta',
      ingredients: [{ name: 'pasta', have: true, quantity: '200g' }],
      plating: [
        { partnerSlot: 1, partnerName: 'Alex', targetCalories: 2000, plate: 'pasta with parmesan cheese', protein: 30, carbs: 50, fat: 20 },
      ],
    };
    const profiles = makeContext(['dairy']);
    expect(assertMealIsSafe(dairyMeal, profiles)).toBe(false);
  });

  it('checks both partners allergens', () => {
    const profiles: PartnerContext[] = [
      { name: 'Alex', diet: 'omnivore', allergens: ['peanut'], tdee: null, goal: null, activityLevel: null, slot: 1 },
      { name: 'Sam', diet: 'vegan', allergens: ['shellfish'], tdee: null, goal: null, activityLevel: null, slot: 2 },
    ];
    const shrimpMeal: GeneratedMeal = {
      ...safeMeal,
      name: 'Shrimp Noodles',
      ingredients: [{ name: 'shrimp', have: false, quantity: '200g' }],
      steps: ['Cook shrimp', 'Mix with noodles'],
    };
    expect(assertMealIsSafe(shrimpMeal, profiles)).toBe(false);
  });

  it('does not false-positive on partial word matches', () => {
    const profiles = makeContext(['nut']);
    const walnutMeal: GeneratedMeal = {
      ...safeMeal,
      name: 'Walnut Salad',
      ingredients: [{ name: 'walnuts', have: true, quantity: '30g' }],
      steps: ['Toast walnuts', 'Mix with greens'],
    };
    expect(assertMealIsSafe(walnutMeal, profiles)).toBe(true);
  });
});
