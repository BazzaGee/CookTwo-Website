CREATE TABLE IF NOT EXISTS household_subscriptions (
  household_id            TEXT PRIMARY KEY REFERENCES households(id),
  tier                    TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free','premium')),
  plan_period             TEXT CHECK(plan_period IN ('monthly','yearly') OR plan_period IS NULL),
  timezone                TEXT NOT NULL DEFAULT 'UTC',
  last_reset_date         TEXT,
  used_today              INTEGER NOT NULL DEFAULT 0,
  daily_quota             INTEGER NOT NULL DEFAULT 10,
  images_used_today       INTEGER NOT NULL DEFAULT 0,
  daily_image_quota       INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  current_period_end      INTEGER,
  cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','past_due','canceled')),
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id TEXT NOT NULL REFERENCES households(id),
  partner_id   TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  resource     TEXT NOT NULL,
  cost         INTEGER NOT NULL,
  succeeded    INTEGER NOT NULL,
  called_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_household_day ON ai_usage_log(household_id, called_at);
