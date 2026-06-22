import { describe, it, expect } from 'vitest';
import { createPartner, getPartners, updatePartner } from '../routes/profiles';
import { createTestD1 } from '../__tests__/helpers';

describe('Profile persistence — allergen updates propagate immediately', () => {
  const db = createTestD1();
  const hh = 'hh-persist';

  it('allergen update appears in the very next getPartners call', async () => {
    await createPartner(db, hh, 'pa-1', 1, 'Alice');
    await updatePartner(db, 'pa-1', { allergens: ['peanut'] });

    const partners = await getPartners(db, hh);
    const alice = partners.find((p) => p.id === 'pa-1');
    expect(alice).toBeDefined();
    expect(alice!.allergens).toEqual(['peanut']);
    expect(alice!.allergies).toBe('peanut');
  });

  it('allergen replacement clears old and sets new', async () => {
    await createPartner(db, 'hh-persist2', 'pa-2', 1, 'Bob');
    await updatePartner(db, 'pa-2', { allergens: ['peanut', 'shellfish'] });
    const afterFirst = await getPartners(db, 'hh-persist2');
    expect(afterFirst[0].allergens).toEqual(['peanut', 'shellfish']);

    await updatePartner(db, 'pa-2', { allergens: ['dairy'] });
    const afterSecond = await getPartners(db, 'hh-persist2');
    expect(afterSecond[0].allergens).toEqual(['dairy']);
    expect(afterSecond[0].allergens).not.toContain('peanut');
  });

  it('profile weight change propagates to next read', async () => {
    await createPartner(db, 'hh-persist3', 'pa-3', 1, 'Carol');
    await updatePartner(db, 'pa-3', {
      weightKg: 80, heightCm: 175, age: 28,
      gender: 'female', activityLevel: 'active', goal: 'maintain',
    });
    const bmr1 = (await getPartners(db, 'hh-persist3'))[0].tdee!.bmr;

    await updatePartner(db, 'pa-3', { weightKg: 75 });
    const bmr2 = (await getPartners(db, 'hh-persist3'))[0].tdee!.bmr;

    expect(bmr2).toBeLessThan(bmr1);
  });

  it('diet change propagates without stale cache', async () => {
    await createPartner(db, 'hh-persist4', 'pa-4', 1, 'Dave');
    await updatePartner(db, 'pa-4', { diet: 'vegan' });
    const p1 = await getPartners(db, 'hh-persist4');
    expect(p1[0].diet).toBe('vegan');

    await updatePartner(db, 'pa-4', { diet: 'keto' });
    const p2 = await getPartners(db, 'hh-persist4');
    expect(p2[0].diet).toBe('keto');
    expect(p2[0].diet).not.toBe('vegan');
  });

  it('partner 2 profile changes do not affect partner 1', async () => {
    await createPartner(db, 'hh-persist5', 'pa-5a', 1, 'Eve');
    await createPartner(db, 'hh-persist5', 'pa-5b', 2, 'Frank');

    await updatePartner(db, 'pa-5b', { allergens: ['soy'], diet: 'gluten-free' });

    const partners = await getPartners(db, 'hh-persist5');
    const eve = partners.find((p) => p.slot === 1)!;
    const frank = partners.find((p) => p.slot === 2)!;

    expect(eve.allergens).toEqual([]);
    expect(eve.diet).toBe('omnivore');
    expect(frank.allergens).toEqual(['soy']);
    expect(frank.diet).toBe('gluten-free');
  });
});
