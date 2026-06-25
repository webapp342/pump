-- Snapshot native/USD at trade time (ETHUSDT on Base, BNBUSDT elsewhere).
-- UI reads this for fixed Amount/Price USD; live rate is fallback for legacy rows.

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS native_usd_rate numeric(24, 8);

COMMENT ON COLUMN public.trades.native_usd_rate IS
  'Native/USD (ETH or BNB) at indexer ingest time; freezes trade tape USD columns.';
