CREATE TABLE IF NOT EXISTS partner_allergens (
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  allergen   TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'strict' CHECK(severity IN ('strict')),
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (partner_id, allergen)
);
