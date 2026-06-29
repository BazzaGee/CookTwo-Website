-- Drop the image-generation quota feature entirely. Per Phase 1c of the
-- feature audit, AI image generation has been removed from the app and website.
-- Migration 0007_subscriptions.sql created these columns.
ALTER TABLE household_subscriptions DROP COLUMN images_used_today;
ALTER TABLE household_subscriptions DROP COLUMN daily_image_quota;
