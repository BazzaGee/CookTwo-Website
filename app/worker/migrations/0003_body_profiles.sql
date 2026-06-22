-- Step 7: Body Profiles for Adaptive Cooking
-- Adds body stats and goals to the partners table.

ALTER TABLE partners ADD COLUMN weight_kg REAL DEFAULT NULL;
ALTER TABLE partners ADD COLUMN height_cm REAL DEFAULT NULL;
ALTER TABLE partners ADD COLUMN age INTEGER DEFAULT NULL;
ALTER TABLE partners ADD COLUMN gender TEXT DEFAULT NULL CHECK(gender IN ('male','female','other'));
ALTER TABLE partners ADD COLUMN activity_level TEXT DEFAULT 'sedentary' CHECK(activity_level IN ('sedentary','light','moderate','active','very_active'));
ALTER TABLE partners ADD COLUMN goal TEXT DEFAULT 'maintain' CHECK(goal IN ('lose','maintain','gain'));
