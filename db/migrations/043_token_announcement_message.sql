-- Callout message + drop holdings requirement from product path
-- (columns token_balance_* kept nullable for legacy rows; new inserts write NULL)

ALTER TABLE token_announcements
  ADD COLUMN IF NOT EXISTS message text;

COMMENT ON COLUMN token_announcements.message IS
  'Optional user note on callout (max enforced in app).';

-- Grants unchanged; pump_app already has INSERT/UPDATE on token_announcements
