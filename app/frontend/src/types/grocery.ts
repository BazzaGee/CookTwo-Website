import type { GeneratedMeal } from './meal';

export type Category = 'Produce' | 'Meat' | 'Dairy' | 'Pantry' | 'Household' | 'Personal Care';

export type PartnerSlot = 1 | 2;

export interface GroceryItem {
  id: string;
  householdId: string;
  name: string;
  category: Category;
  isChecked: boolean;
  isFood: boolean;
  brand: string;
  needsReview: boolean;
  addedByPartnerId: string;
  addedByPartnerSlot: PartnerSlot;
  createdAt: number;
  updatedAt: number;
}

export interface PantryItem {
  id: string;
  householdId: string;
  name: string;
  quantity: string;
  category: Category;
  quantityValue: number | null;
  quantityUnit: string;
  brand: string;
  isFood: boolean;
  needsReview: boolean;
  addedByPartnerId: string;
  addedByPartnerSlot: PartnerSlot;
  createdAt: number;
}

export type SyncEvent =
  | { type: 'item_added'; item: GroceryItem }
  | { type: 'items_added'; items: GroceryItem[] }
  | { type: 'item_toggled'; item: GroceryItem }
  | { type: 'item_deleted'; id: string }
  | { type: 'items_moved'; deletedIds: string[]; pantryItems: PantryItem[] }
  | { type: 'item_updated'; item: GroceryItem }
  | { type: 'pantry_added'; item: PantryItem }
  | { type: 'pantry_updated'; item: PantryItem }
  | { type: 'pantry_deleted'; id: string }
  | { type: 'meal_generated'; meal: GeneratedMeal; imageUrl?: string; recipeId?: string; generatedBySlot: PartnerSlot; generatedByName?: string; generatedByPartnerId?: string; aiMessage?: string; at: number }
  | { type: 'recipe_added'; recipeId: string; recipeName: string; at: number }
  | { type: 'hello'; partnerId: string; slot: PartnerSlot; at: number };

export const CATEGORIES: readonly Category[] = ['Produce', 'Meat', 'Dairy', 'Pantry', 'Household', 'Personal Care'] as const;

export const FOOD_CATEGORIES: readonly Category[] = ['Produce', 'Meat', 'Dairy', 'Pantry'] as const;
