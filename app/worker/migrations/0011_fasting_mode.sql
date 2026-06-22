-- Adds fasting_mode to partners for intermittent fasting (IF) as an orthogonal timing pattern.
-- IF stacks on top of any food diet: e.g. "mediterranean + 16:8".
-- Valid values: NULL (no fasting), '16-8', '18-6', '20-4', '5-2', 'eat-stop-eat', 'adf', 'omad'.

ALTER TABLE partners ADD COLUMN fasting_mode TEXT DEFAULT NULL;
