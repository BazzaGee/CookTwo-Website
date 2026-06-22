import { describe, it, expect } from 'vitest';
import { detectPantryConflict } from '../lib/pantry-conflict';

describe('detectPantryConflict', () => {
  it('returns all items as safe when there are no allergens or diet restrictions', () => {
    const result = detectPantryConflict(
      [{ name: 'milk' }, { name: 'chicken' }, { name: 'rice' }],
      [],
      {},
      new Set(),
    );
    expect(result.safe).toEqual(['milk', 'chicken', 'rice']);
    expect(result.allergenConflicting).toEqual([]);
    expect(result.dietConflicting).toEqual([]);
    expect(result.totalFoodItems).toBe(3);
  });

  it('flags all-dairy pantry as allergen-conflicting when dairy is an allergen (user scenario)', () => {
    const result = detectPantryConflict(
      [{ name: 'milk' }, { name: 'cheese' }, { name: 'butter' }, { name: 'yogurt' }],
      ['dairy'],
      {},
      new Set(),
    );
    expect(result.safe).toEqual([]);
    expect(result.allergenConflicting).toEqual(['milk', 'cheese', 'butter', 'yogurt']);
    expect(result.hasAllergenConflict).toBe(true);
    expect(result.hasDietConflict).toBe(false);
  });

  it('detects cross-reactive dairy derivatives (cream, whey)', () => {
    const result = detectPantryConflict(
      [{ name: 'heavy cream' }, { name: 'whey protein' }, { name: 'chicken' }],
      ['dairy'],
      {},
      new Set(),
    );
    expect(result.allergenConflicting).toContain('heavy cream');
    expect(result.allergenConflicting).toContain('whey protein');
    expect(result.safe).toEqual(['chicken']);
  });

  it('keeps safe items separate from conflicting ones', () => {
    const result = detectPantryConflict(
      [{ name: 'milk' }, { name: 'chicken breast' }, { name: 'rice' }],
      ['dairy'],
      {},
      new Set(),
    );
    expect(result.allergenConflicting).toEqual(['milk']);
    expect(result.safe).toEqual(['chicken breast', 'rice']);
  });

  it('flags diet-restricted items (e.g. grains on keto) as diet-conflicting, not allergen', () => {
    const result = detectPantryConflict(
      [{ name: 'rice' }, { name: 'pasta' }, { name: 'chicken' }],
      [],
      { rice: 'grains', pasta: 'grains', chicken: 'meat' },
      new Set(['grains']),
    );
    expect(result.dietConflicting).toEqual(['rice', 'pasta']);
    expect(result.allergenConflicting).toEqual([]);
    expect(result.safe).toEqual(['chicken']);
    expect(result.hasDietConflict).toBe(true);
  });

  it('returns zero food items for an empty pantry', () => {
    const result = detectPantryConflict([], ['dairy'], {}, new Set());
    expect(result.totalFoodItems).toBe(0);
    expect(result.safe).toEqual([]);
  });
});
