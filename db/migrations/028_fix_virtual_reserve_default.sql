-- MemeFactory defaultVirtualEthReserve = 5 ether.
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/028_fix_virtual_reserve_default.sql

UPDATE bonding_states
SET virtual_zug_reserve = 5
WHERE virtual_zug_reserve >= 5000;

ALTER TABLE bonding_states
  ALTER COLUMN virtual_zug_reserve SET DEFAULT 5;
