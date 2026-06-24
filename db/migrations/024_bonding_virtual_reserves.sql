-- Per-token bonding curve virtual reserves (from TokenRegistered on-chain).
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/024_bonding_virtual_reserves.sql

ALTER TABLE bonding_states
  ADD COLUMN IF NOT EXISTS virtual_zug_reserve numeric(78,18) DEFAULT 5 NOT NULL,
  ADD COLUMN IF NOT EXISTS virtual_token_reserve numeric(78,18) DEFAULT 1000000000 NOT NULL;

COMMENT ON COLUMN bonding_states.virtual_zug_reserve IS 'Virtual BNB reserve (human units) at token registration';
COMMENT ON COLUMN bonding_states.virtual_token_reserve IS 'Virtual token reserve (human units) at token registration';
