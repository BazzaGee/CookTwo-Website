import { describe, it, expect } from 'vitest';
import { calculateTDEE, type Gender, type ActivityLevel, type Goal } from '../lib/tdee';

describe('calculateTDEE', () => {
  it('calculates BMR for male using Mifflin-St Jeor', () => {
    const result = calculateTDEE({
      weightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'male',
      activityLevel: 'moderate',
      goal: 'maintain',
    });
    expect(result.bmr).toBe(10 * 80 + 6.25 * 180 - 5 * 30 + 5);
    expect(result.tdee).toBe(Math.round(result.bmr * 1.55));
  });

  it('calculates BMR for female correctly', () => {
    const result = calculateTDEE({
      weightKg: 65,
      heightCm: 165,
      age: 28,
      gender: 'female',
      activityLevel: 'light',
      goal: 'lose',
    });
    const expectedBmr = Math.round(10 * 65 + 6.25 * 165 - 5 * 28 - 161);
    expect(result.bmr).toBe(expectedBmr);
    expect(result.tdee).toBe(Math.round(expectedBmr * 1.375));
    expect(result.targetCalories).toBe(Math.max(1200, result.tdee - 500));
  });

  it('gender other is the mean of male and female', () => {
    const male = calculateTDEE({ weightKg: 70, heightCm: 170, age: 25, gender: 'male', activityLevel: 'sedentary', goal: 'maintain' }).bmr;
    const female = calculateTDEE({ weightKg: 70, heightCm: 170, age: 25, gender: 'female', activityLevel: 'sedentary', goal: 'maintain' }).bmr;
    const other = calculateTDEE({ weightKg: 70, heightCm: 170, age: 25, gender: 'other', activityLevel: 'sedentary', goal: 'maintain' }).bmr;
    expect(other).toBe(Math.round((male + female) / 2));
  });

  it('targetCalories has a floor of 1200', () => {
    const result = calculateTDEE({ weightKg: 40, heightCm: 140, age: 16, gender: 'female', activityLevel: 'sedentary', goal: 'lose' });
    expect(result.targetCalories).toBe(1200);
  });

  it('lose < maintain < gain for the same person', () => {
    const lose = calculateTDEE({ weightKg: 75, heightCm: 175, age: 30, gender: 'male', activityLevel: 'active', goal: 'lose' });
    const maintain = calculateTDEE({ weightKg: 75, heightCm: 175, age: 30, gender: 'male', activityLevel: 'active', goal: 'maintain' });
    const gain = calculateTDEE({ weightKg: 75, heightCm: 175, age: 30, gender: 'male', activityLevel: 'active', goal: 'gain' });
    expect(lose.targetCalories).toBeLessThan(maintain.targetCalories);
    expect(maintain.targetCalories).toBeLessThan(gain.targetCalories);
  });

  it('targetCalories increases monotonically with activity level', () => {
    const results = (['sedentary', 'light', 'moderate', 'active', 'very_active'] as ActivityLevel[]).map(
      (a) => calculateTDEE({ weightKg: 70, heightCm: 170, age: 25, gender: 'male', activityLevel: a, goal: 'maintain' })
    );
    for (let i = 1; i < results.length; i++) {
      const curr = results[i]!;
      const prev = results[i - 1]!;
      expect(curr.targetCalories).toBeGreaterThan(prev.targetCalories);
    }
  });
});
