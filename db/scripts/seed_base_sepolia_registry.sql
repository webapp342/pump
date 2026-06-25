-- Manual contract_registry seed (optional — Admin wipe auto-syncs from .env).
-- Prefer: set .env addresses, then Admin → Reset data → Wipe.
--
-- Current Base Sepolia deploy (2026-03):
--   meme_factory:           0xaa3ac8559417d1101fff43cff4fdd50279c2e594
--   bonding_curve_manager:  0x0f8b0052f7750e6d481dbb447fd4b7b45ac3b615
--   pump_airdrop_manager:   0x91e499d95835915b54e12e82df04167d52f17a49

BEGIN;

INSERT INTO contract_registry (contract_key, chain_id, address, is_active, updated_at)
VALUES
  ('meme_factory', 84532, '0xaa3ac8559417d1101fff43cff4fdd50279c2e594', true, now()),
  ('bonding_curve_manager', 84532, '0x0f8b0052f7750e6d481dbb447fd4b7b45ac3b615', true, now()),
  ('pump_airdrop_manager', 84532, '0x91e499d95835915b54e12e82df04167d52f17a49', true, now())
ON CONFLICT (contract_key) DO UPDATE
SET chain_id = EXCLUDED.chain_id,
    address = EXCLUDED.address,
    is_active = true,
    updated_at = now();

COMMIT;
