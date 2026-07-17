-- Perk activation lookups (launch spotlight pins + airdrop weight apply).
-- Inventory already has status/expires_at/metadata from 036_points_redeem.

CREATE INDEX IF NOT EXISTS points_inventory_launch_pin_active_idx
  ON public.points_inventory (expires_at DESC)
  WHERE item_id = 'launch_boost'
    AND status = 'consumed'
    AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS points_inventory_airdrop_weight_idx
  ON public.points_inventory ((metadata ->> 'airdrop_id'))
  WHERE item_id = 'airdrop_weight'
    AND status = 'consumed';
