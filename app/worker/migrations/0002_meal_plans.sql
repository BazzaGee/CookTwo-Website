-- Step 6: Meal Calendar
-- Stores generated meals and weekly plans.

CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  day_of_week TEXT NOT NULL CHECK(day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),
  meal_type TEXT NOT NULL DEFAULT 'dinner' CHECK(meal_type IN ('breakfast','lunch','dinner')),
  meal_name TEXT NOT NULL,
  meal_data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_household ON meal_plans(household_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_day ON meal_plans(household_id, day_of_week);
