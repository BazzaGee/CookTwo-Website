-- Step 3: Partner Profiles + D1 Database
-- Creates the persistent relational layer for households and partner profiles.
-- The Durable Object (HouseholdSync) still handles real-time grocery data.
-- D1 handles everything else: profiles, recipes, history.

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  invite_code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
  name TEXT NOT NULL,
  diet TEXT NOT NULL DEFAULT 'omnivore',
  allergies TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_partners_household ON partners(household_id);
CREATE INDEX IF NOT EXISTS idx_partners_slot ON partners(household_id, slot);
