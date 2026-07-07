-- Reverse lookup for favorite-token trade push alerts
CREATE INDEX IF NOT EXISTS idx_token_favorites_token_user
  ON public.token_favorites (token_address, user_address);
