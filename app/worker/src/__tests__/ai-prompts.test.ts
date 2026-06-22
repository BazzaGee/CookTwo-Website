import { describe, it, expect } from 'vitest';
import { buildChatSystemPrompt, buildPrompt, type GeneratedMeal } from '../lib/ai';
import type { Diet, Goal, ActivityLevel } from '../routes/profiles';
import type { TDEEResult } from '../lib/tdee';

const basePantry = [
  { name: 'chicken breast', quantity: '2', category: 'Meat', quantityValue: 2, quantityUnit: 'lbs' },
  { name: 'rice', quantity: '1 cup', category: 'Pantry', quantityValue: 1, quantityUnit: 'cup' },
  { name: 'spinach', quantity: '', category: 'Produce' },
];

const tdeeResult: TDEEResult = { bmr: 1700, tdee: 2200, targetCalories: 1700 };

function makeProfile(overrides: Partial<Parameters<typeof buildChatSystemPrompt>[1][0]> = {}): Parameters<typeof buildChatSystemPrompt>[1] {
  return [
    {
      name: 'Alex',
      diet: 'omnivore' as Diet,
      allergens: [],
      tdee: null,
      goal: null,
      activityLevel: null,
      slot: 1 as const,
      ...overrides,
    },
  ];
}

describe('buildChatSystemPrompt', () => {
  it('includes pantry items in the prompt', () => {
    const prompt = buildChatSystemPrompt(basePantry, makeProfile());
    expect(prompt).toContain('chicken breast (2 lbs, Meat)');
    expect(prompt).toContain('rice (1 cup, Pantry)');
    expect(prompt).toContain('spinach (Produce)');
  });

  it('shows empty pantry when no items', () => {
    const prompt = buildChatSystemPrompt([], makeProfile());
    expect(prompt).toContain('Pantry: empty');
  });

  it('includes solo partner info when only one partner exists', () => {
    const prompt = buildChatSystemPrompt(basePantry, makeProfile({ name: 'Alex', diet: 'vegan' }));
    expect(prompt).toContain('Partner 1: Alex');
    expect(prompt).toContain('diet=vegan');
    expect(prompt).toContain('Partner 2: no profile set');
  });

  it('includes both partners when both exist', () => {
    const profiles = makeProfile({ name: 'Alex', diet: 'vegetarian' });
    profiles.push({ name: 'Sam', diet: 'omnivore', allergens: [], tdee: null, goal: null, activityLevel: null, slot: 2 as const });
    const prompt = buildChatSystemPrompt(basePantry, profiles);
    expect(prompt).toContain('Partner 1: Alex');
    expect(prompt).toContain('Partner 2: Sam');
  });

  it('includes structured allergens when present', () => {
    const profiles = makeProfile({ name: 'Alex', allergens: ['peanut', 'shellfish'] });
    const prompt = buildChatSystemPrompt(basePantry, profiles);
    expect(prompt).toContain('allergies=peanut, shellfish');
    expect(prompt).toContain('STRICTLY AVOID any trace of these allergens');
  });

  it('does not include allergen rule when no allergens', () => {
    const prompt = buildChatSystemPrompt(basePantry, makeProfile());
    expect(prompt).not.toContain('STRICTLY AVOID');
  });

  it('includes goal when set', () => {
    const profiles = makeProfile({ name: 'Alex', goal: 'lose' });
    const prompt = buildChatSystemPrompt(basePantry, profiles);
    expect(prompt).toContain('goal=lose weight');
    expect(prompt).toContain('Respect each partner');
  });

  it('includes plating instructions when both partners have TDEE', () => {
    const profiles = makeProfile({
      name: 'Alex',
      tdee: tdeeResult,
      goal: 'maintain',
    });
    profiles.push({ name: 'Sam', diet: 'omnivore', allergens: [], tdee: tdeeResult, goal: 'maintain', activityLevel: null, slot: 2 as const });
    const prompt = buildChatSystemPrompt(basePantry, profiles);
    expect(prompt).toContain('targetCalories');
    expect(prompt).toContain('plating');
    expect(prompt).toContain('different portion sizes');
  });

  it('does not include plating when only one partner has TDEE', () => {
    const profiles = makeProfile({
      name: 'Alex',
      tdee: tdeeResult,
      goal: 'maintain',
    });
    profiles.push({ name: 'Sam', diet: 'omnivore', allergens: [], tdee: null, goal: null, activityLevel: null, slot: 2 as const });
    const prompt = buildChatSystemPrompt(basePantry, profiles);
    expect(prompt).not.toContain('different portion sizes');
  });

  it('includes both partners allergens in combined rule', () => {
    const profiles = makeProfile({ name: 'Alex', allergens: ['peanut'] });
    profiles.push({ name: 'Sam', diet: 'vegan', allergens: ['shellfish'], tdee: null, goal: null, activityLevel: null, slot: 2 as const });
    const prompt = buildChatSystemPrompt(basePantry, profiles);
    expect(prompt).toContain('peanut');
    expect(prompt).toContain('shellfish');
    expect(prompt).toContain('100% free');
  });

  it('includes cross-reactivity note in the allergen rule', () => {
    const profiles = makeProfile({ name: 'Alex', allergens: ['peanut'] });
    const prompt = buildChatSystemPrompt(basePantry, profiles);
    expect(prompt).toContain('oils, flours, butters');
  });
});

describe('buildPrompt', () => {
  it('includes both partners and allergen info', () => {
    const prompt = buildPrompt(
      basePantry,
      'vegan' as Diet, 'omnivore' as Diet,
      ['peanut'], ['shellfish'],
      'lose' as Goal | null, 'maintain' as Goal | null,
      undefined, undefined,
    );
    expect(prompt).toContain('diet=vegan');
    expect(prompt).toContain('diet=omnivore');
    expect(prompt).toContain('allergies=peanut');
    expect(prompt).toContain('avoid known derivatives');
  });

  it('includes plating section when both partners have body profiles', () => {
    const prompt = buildPrompt(
      basePantry,
      'omnivore', 'omnivore',
      [], [],
      'maintain', 'maintain',
      { name: 'Alex', tdee: tdeeResult },
      { name: 'Sam', tdee: tdeeResult },
    );
    expect(prompt).toContain('TWO different plating instructions');
    expect(prompt).toContain('Alex');
    expect(prompt).toContain('Sam');
  });

  it('shows goal rule when set', () => {
    const prompt = buildPrompt(
      basePantry,
      'vegetarian', 'omnivore',
      [], [],
      'gain', null,
    );
    expect(prompt).toContain('build muscle');
    expect(prompt).toContain('body goal');
  });
});
