-- Bonding OHLC needs first-print (spot before trade) for open / wicks.
-- History SSOT: argMin(open_print, block_time) from trades_raw — not pre-baked candles_spot.

ALTER TABLE pump.trades_raw
  ADD COLUMN IF NOT EXISTS spot_before_sol Float64 DEFAULT 0;
