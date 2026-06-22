-- Activity log for household actions (D1 side: profiles, recipes, meals, household events)
-- Grocery/pantry actions are logged inside the HouseholdSync Durable Object.
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  partner_id TEXT,
  partner_slot INTEGER,
  partner_name TEXT,
  action_type TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT,
  payload TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_log_household_created ON activity_log(household_id, created_at DESC);
