-- USD snapshot on trade buckets (native OHLC remains source of truth).
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/027_token_candles_usd.sql

ALTER TABLE public.token_candles
  ADD COLUMN IF NOT EXISTS close_usd numeric(38, 18),
  ADD COLUMN IF NOT EXISTS native_usd_rate numeric(24, 8);

COMMENT ON COLUMN public.token_candles.close_usd IS
  'USD spot close at last trade in bucket (close_zug * native_usd_rate). Gap bars: compute at read time.';
COMMENT ON COLUMN public.token_candles.native_usd_rate IS
  'BNB/ETH USDT rate when bucket was last updated by indexer';
