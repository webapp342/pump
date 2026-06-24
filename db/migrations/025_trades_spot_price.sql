-- Spot (mark) price at trade time — chart replay without full curve simulation.
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/025_trades_spot_price.sql

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS spot_price_zug numeric(78,18);

COMMENT ON COLUMN trades.spot_price_zug IS 'Bonding-curve marginal spot after trade (BNB per token); price_zug remains execution fill';

-- Best-effort backfill: use execution price when spot unknown (legacy rows).
UPDATE trades
SET spot_price_zug = price_zug
WHERE spot_price_zug IS NULL AND price_zug > 0;
