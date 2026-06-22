-- Diet Catalog: structured rules for all diets the app supports.
-- Populated by seed script from Diet Research encoding specs.
-- Queried by ai.ts to inject rules into meal-generation prompts.

CREATE TABLE IF NOT EXISTS diet_catalog (
  diet_key          TEXT PRIMARY KEY,
  display_label     TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'lifestyle',
  emoji             TEXT NOT NULL DEFAULT '',
  short_desc        TEXT NOT NULL DEFAULT '',
  evidence_grade    TEXT NOT NULL DEFAULT 'B',
  restrictiveness   INTEGER NOT NULL DEFAULT 3,
  is_timing_pattern INTEGER NOT NULL DEFAULT 0,
  is_default        INTEGER NOT NULL DEFAULT 0,

  ai_rules          TEXT NOT NULL DEFAULT '',
  allowed_groups    TEXT NOT NULL DEFAULT '[]',
  restricted_groups TEXT NOT NULL DEFAULT '[]',
  classifier_terms  TEXT NOT NULL DEFAULT '{}',
  macro_targets     TEXT NOT NULL DEFAULT '{}',

  easy_matches      TEXT NOT NULL DEFAULT '[]',
  adaptable_matches TEXT NOT NULL DEFAULT '{}',
  hard_conflicts    TEXT NOT NULL DEFAULT '{}',

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS diet_articles (
  diet_key   TEXT NOT NULL,
  file_slug  TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  r2_key     TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (diet_key, file_slug)
);
