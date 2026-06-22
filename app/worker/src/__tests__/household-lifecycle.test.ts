import { describe, it, expect } from 'vitest';
import { createPartner, getPartners, updatePartner } from '../routes/profiles';
import { createTestD1 } from './helpers';

describe('Household lifecycle (through D1 operations)', () => {
  const db = createTestD1();

  it('createPartner inserts and returns a partner with defaults', async () => {
    const partner = await createPartner(db, 'hh-test', 'p1', 1, 'Alex');
    expect(partner.id).toBe('p1');
    expect(partner.slot).toBe(1);
    expect(partner.name).toBe('Alex');
    expect(partner.diet).toBe('omnivore');
    expect(partner.allergens).toEqual([]);
    expect(partner.tdee).toBeNull();
  });

  it('getPartners returns partners for a household', async () => {
    await createPartner(db, 'hh-test-2', 'p2a', 1, 'Alice');
    await createPartner(db, 'hh-test-2', 'p2b', 2, 'Bob');
    const partners = await getPartners(db, 'hh-test-2');
    expect(partners.length).toBe(2);
    expect(partners[0].name).toBe('Alice');
    expect(partners[1].name).toBe('Bob');
  });

  it('getPartners returns empty array for unknown household', async () => {
    const partners = await getPartners(db, 'hh-nonexistent');
    expect(partners).toEqual([]);
  });

  it('updatePartner partial update preserves other fields', async () => {
    await createPartner(db, 'hh-test-3', 'p3', 1, 'Charlie');
    const updated = await updatePartner(db, 'p3', { diet: 'vegan' });
    expect(updated).not.toBeNull();
    expect(updated!.diet).toBe('vegan');
    expect(updated!.name).toBe('Charlie');
    expect(updated!.allergens).toEqual([]);
  });

  it('updatePartner updates allergens and syncs allergies text', async () => {
    await createPartner(db, 'hh-test-4', 'p4', 1, 'Diana');
    const updated = await updatePartner(db, 'p4', { allergens: ['peanut', 'shellfish'] });
    expect(updated).not.toBeNull();
    expect(updated!.allergens).toEqual(['peanut', 'shellfish']);
    expect(updated!.allergies).toBe('peanut, shellfish');
  });

  it('updatePartner with empty allergens clears them', async () => {
    await createPartner(db, 'hh-test-5', 'p5', 1, 'Eve');
    await updatePartner(db, 'p5', { allergens: ['dairy'] });
    const cleared = await updatePartner(db, 'p5', { allergens: [] });
    expect(cleared).not.toBeNull();
    expect(cleared!.allergens).toEqual([]);
    expect(cleared!.allergies).toBe('');
  });

  it('updatePartner with weightKg=null works', async () => {
    await createPartner(db, 'hh-test-6', 'p6', 1, 'Frank');
    const updated = await updatePartner(db, 'p6', { weightKg: null });
    expect(updated).not.toBeNull();
    expect(updated!.weightKg).toBeNull();
  });

  it('updatePartner returns null for non-existent partner', async () => {
    const result = await updatePartner(db, 'p-nonexistent', { name: 'Ghost' });
    expect(result).toBeNull();
  });

  it('createPartner accepts allergens', async () => {
    const partner = await createPartner(db, 'hh-test-7', 'p7', 1, 'Grace', ['soy', 'gluten']);
    expect(partner.allergens).toEqual(['soy', 'gluten']);
  });
});

describe('TDEE on profile read', () => {
  const db = createTestD1();

  it('computes TDEE when all body fields are present', async () => {
    await createPartner(db, 'hh-tdee', 'pt1', 1, 'Henry');
    const updated = await updatePartner(db, 'pt1', {
      weightKg: 80, heightCm: 180, age: 30,
      gender: 'male', activityLevel: 'active', goal: 'gain',
    });
    expect(updated).not.toBeNull();
    expect(updated!.tdee).not.toBeNull();
    expect(updated!.tdee!.targetCalories).toBeGreaterThan(updated!.tdee!.tdee);
    expect(updated!.tdee!.bmr).toBe(Math.round(10 * 80 + 6.25 * 180 - 5 * 30 + 5));
  });

  it('does not compute TDEE when body fields are missing', async () => {
    await createPartner(db, 'hh-tdee2', 'pt2', 1, 'Isabel');
    const updated = await updatePartner(db, 'pt2', { weightKg: 70 });
    expect(updated).not.toBeNull();
    expect(updated!.tdee).toBeNull();
  });

  it('recomputes TDEE when weight changes', async () => {
    await createPartner(db, 'hh-tdee3', 'pt3', 1, 'Jack');
    const p1 = await updatePartner(db, 'pt3', {
      weightKg: 80, heightCm: 175, age: 28,
      gender: 'male', activityLevel: 'moderate', goal: 'lose',
    });
    const p2 = await updatePartner(db, 'pt3', {
      weightKg: 75, heightCm: 175, age: 28,
      gender: 'male', activityLevel: 'moderate', goal: 'lose',
    });
    expect(p1!.tdee!.bmr).toBeGreaterThan(p2!.tdee!.bmr);
  });
});
