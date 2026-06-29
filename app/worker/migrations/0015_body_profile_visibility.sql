-- Add per-partner body-profile visibility toggle.
-- Default 0 = locked (partner cannot see weight/height/age/gender/goal).
-- AI meal planner still receives the TDEE/calorie target server-side
-- regardless of this flag (privacy between humans, not from the system).
ALTER TABLE partners ADD COLUMN body_profile_visible INTEGER NOT NULL DEFAULT 0;
