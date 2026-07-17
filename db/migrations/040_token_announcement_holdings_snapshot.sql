-- Snapshot announcer holdings at callout time (no live balance fetch on list).
ALTER TABLE public.token_announcements
  ADD COLUMN IF NOT EXISTS token_balance_at_announce numeric,
  ADD COLUMN IF NOT EXISTS token_balance_usd_at_announce numeric;

COMMENT ON COLUMN public.token_announcements.token_balance_at_announce IS
  'Announcer token balance (human units) at announce time';
COMMENT ON COLUMN public.token_announcements.token_balance_usd_at_announce IS
  'USD value of announcer balance at announce time (null if FX unavailable)';
