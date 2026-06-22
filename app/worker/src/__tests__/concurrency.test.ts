import { describe, it, expect } from 'vitest';
import { createPartner, updatePartner } from '../routes/profiles';
import { createTestD1 } from '../__tests__/helpers';

describe('Concurrency — parallel profile operations', () => {
  it('handles 50 parallel createPartner calls', async () => {
    const db = createTestD1();
    const hh = 'hh-concur';
    const promises = Array.from({ length: 50 }, (_, i) =>
      createPartner(db, hh, `p-concur-${i}`, (i % 2 === 0 ? 1 : 2) as 1 | 2, `User${i}`),
    );
    const results = await Promise.all(promises);
    expect(results.length).toBe(50);
    results.forEach((r, i) => {
      expect(r.name).toBe(`User${i}`);
      expect(r.householdId).toBe(hh);
    });
  });

  it('handles parallel create + update on same partner', async () => {
    const db = createTestD1();
    await createPartner(db, 'hh-par', 'p-par', 1, 'Grace');

    const updates = Array.from({ length: 20 }, (_, i) =>
      updatePartner(db, 'p-par', { weightKg: 60 + i }),
    );
    const results = await Promise.all(updates);
    expect(results.length).toBe(20);
    expect(results.every((r) => r !== null)).toBe(true);
  });

  it('createPartner with unique IDs works across parallel calls', async () => {
    const db = createTestD1();
    const hh = 'hh-par-ids';
    const all = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createPartner(db, hh, `id-${i}`, 1 as const, `N${i}`)),
    );
    const ids = all.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(10);
  });
});
