// DEPRECATED: Categorization now happens on the backend (pantry-parser.ts).
// This file is kept for type reference only. Do not import.

import type { Category } from '../types/grocery';

export const ALL_CATEGORIES: readonly Category[] = ['Produce', 'Meat', 'Dairy', 'Pantry', 'Household', 'Personal Care'];

export function classify(_name: string): Category {
  return 'Pantry';
}
