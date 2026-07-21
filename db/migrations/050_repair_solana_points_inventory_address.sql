-- Repair Solana profile-frame inventory written under lower(base58) before migration 049.
-- Idempotent: only rows where a canonical wallet exists with the same lower() key.

UPDATE points_inventory pi
SET address = sw.address
FROM solana_wallets sw
WHERE pi.address = lower(sw.address)
  AND pi.address <> sw.address
  AND NOT (pi.address LIKE '0x%');

UPDATE points_inventory pi
SET address = u.address
FROM users u
WHERE pi.address = lower(u.address)
  AND pi.address <> u.address
  AND NOT (pi.address LIKE '0x%')
  AND NOT (u.address LIKE '0x%');

UPDATE points_redemptions pr
SET address = sw.address
FROM solana_wallets sw
WHERE pr.address = lower(sw.address)
  AND pr.address <> sw.address
  AND NOT (pr.address LIKE '0x%');

UPDATE points_redemptions pr
SET address = u.address
FROM users u
WHERE pr.address = lower(u.address)
  AND pr.address <> u.address
  AND NOT (pr.address LIKE '0x%')
  AND NOT (u.address LIKE '0x%');
