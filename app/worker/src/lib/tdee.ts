export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

export interface BodyProfile {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface TDEEResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
}

export function calculateTDEE(profile: BodyProfile): TDEEResult {
  const { weightKg, heightCm, age, gender, activityLevel, goal } = profile;

  let bmr: number;
  if (gender === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else if (gender === 'female') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else {
    bmr = (10 * weightKg + 6.25 * heightCm - 5 * age + 5 + (10 * weightKg + 6.25 * heightCm - 5 * age - 161)) / 2;
  }

  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
  const targetCalories = Math.max(1200, tdee + GOAL_ADJUSTMENTS[goal]);

  return {
    bmr: Math.round(bmr),
    tdee,
    targetCalories,
  };
}
