-- Step 7b: Saved Recipes
-- Stores meals that couples have saved from AI generation.

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  meal_data TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  times_cooked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipes_household ON recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_recipes_saved ON recipes(household_id, saved_at DESC);
