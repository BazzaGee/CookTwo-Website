-- Waitlist / email verification table
-- Stores emails from the marketing site opt-in, tracks verification status,
-- and issues per-email access tokens for the PWA gate.

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  verified INTEGER DEFAULT 0,
  verify_token TEXT,
  access_token TEXT,
  resend_contact_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_verify_token ON waitlist(verify_token);
CREATE INDEX IF NOT EXISTS idx_waitlist_access_token ON waitlist(access_token);
