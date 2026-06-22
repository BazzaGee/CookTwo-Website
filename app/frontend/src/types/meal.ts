export interface MealIngredient {
  name: string;
  have: boolean;
  quantity: string;
}

export interface PlatingInstruction {
  partnerSlot: number;
  partnerName: string;
  targetCalories: number;
  plate: string;
  protein: number;
  carbs: number;
  fat: number;
}

export interface GeneratedMeal {
  name: string;
  description: string;
  timeMinutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: MealIngredient[];
  steps: string[];
  plating?: PlatingInstruction[];
  savedRecipeId?: string;
}
