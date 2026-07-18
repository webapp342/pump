-- Backfill stats rollups from historical trades (run after 042 migration)
-- sudo -u postgres psql -d pump_db -f db/refresh/backfill_stats_rollups.sql

-- Launch mcap + peak multiplier on token_board_stats
UPDATE token_board_stats tbs
SET launch_mcap_zug = sub.launch_mcap,
    peak_multiplier_x = GREATEST(
      1,
      CASE
        WHEN sub.launch_mcap > 0
        THEN tbs.ath_market_cap_zug / sub.launch_mcap
        ELSE 1
      END
    )
FROM (
  SELECT
    b.token_address,
    (
      COALESCE(b.virtual_zug_reserve, 5)::numeric
      / NULLIF(COALESCE(b.virtual_token_reserve, 1000000000)::numeric, 0)
      * 1000000000::numeric
    ) AS launch_mcap
  FROM bonding_states b
) sub
WHERE sub.token_address = tbs.token_address;

-- user_trade_stats
INSERT INTO user_trade_stats (
  address,
  trade_count,
  buy_count,
  sell_count,
  distinct_tokens,
  total_volume_zug,
  first_trade_at,
  last_trade_at,
  updated_at
)
SELECT
  trader_address,
  COUNT(*)::integer,
  COUNT(*) FILTER (WHERE side = 'BUY')::integer,
  COUNT(*) FILTER (WHERE side = 'SELL')::integer,
  COUNT(DISTINCT token_address)::integer,
  COALESCE(SUM(zug_amount), 0),
  MIN(block_time),
  MAX(block_time),
  now()
FROM trades
GROUP BY trader_address
ON CONFLICT (address) DO UPDATE SET
  trade_count = EXCLUDED.trade_count,
  buy_count = EXCLUDED.buy_count,
  sell_count = EXCLUDED.sell_count,
  distinct_tokens = EXCLUDED.distinct_tokens,
  total_volume_zug = EXCLUDED.total_volume_zug,
  first_trade_at = EXCLUDED.first_trade_at,
  last_trade_at = EXCLUDED.last_trade_at,
  updated_at = now();

-- referrer_network_stats
INSERT INTO referrer_network_stats (
  referrer_address,
  qualified_invite_count,
  active_invitee_count_30d,
  network_volume_zug,
  network_fee_earned_zug,
  avg_volume_per_invitee,
  repeat_trader_count,
  repeat_trader_rate,
  updated_at
)
SELECT
  rb.referrer_address,
  COUNT(DISTINCT rb.invitee_address)::integer,
  COUNT(DISTINCT rb.invitee_address) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM trades t2
      WHERE t2.trader_address = rb.invitee_address
        AND t2.block_time >= now() - interval '30 days'
    )
  )::integer,
  COALESCE(SUM(t.zug_amount), 0),
  COALESCE(SUM(t.referrer_fee_zug), 0),
  CASE
    WHEN COUNT(DISTINCT rb.invitee_address) > 0
    THEN COALESCE(SUM(t.zug_amount), 0) / COUNT(DISTINCT rb.invitee_address)
    ELSE 0
  END,
  COUNT(DISTINCT CASE WHEN uts.trade_count >= 2 THEN rb.invitee_address END)::integer,
  CASE
    WHEN COUNT(DISTINCT rb.invitee_address) > 0
    THEN COUNT(DISTINCT CASE WHEN uts.trade_count >= 2 THEN rb.invitee_address END)::numeric
         / COUNT(DISTINCT rb.invitee_address)
    ELSE 0
  END,
  now()
FROM referral_bindings rb
LEFT JOIN trades t ON t.trader_address = rb.invitee_address
LEFT JOIN user_trade_stats uts ON uts.address = rb.invitee_address
GROUP BY rb.referrer_address
ON CONFLICT (referrer_address) DO UPDATE SET
  qualified_invite_count = EXCLUDED.qualified_invite_count,
  active_invitee_count_30d = EXCLUDED.active_invitee_count_30d,
  network_volume_zug = EXCLUDED.network_volume_zug,
  network_fee_earned_zug = EXCLUDED.network_fee_earned_zug,
  avg_volume_per_invitee = EXCLUDED.avg_volume_per_invitee,
  repeat_trader_count = EXCLUDED.repeat_trader_count,
  repeat_trader_rate = EXCLUDED.repeat_trader_rate,
  updated_at = now();

-- kol_profiles seed from users with follower counts (inactive until they opt in)
INSERT INTO kol_profiles (address, is_active)
SELECT DISTINCT cf.creator_address, false
FROM creator_follows cf
ON CONFLICT (address) DO NOTHING;

-- kol performance from existing announcements
UPDATE kol_profiles kp
SET
  callout_count = stats.cnt,
  median_callout_multiplier = stats.med_x,
  avg_callout_multiplier = stats.avg_x,
  updated_at = now()
FROM (
  SELECT
    announcer_address,
    COUNT(*)::integer AS cnt,
    COALESCE(
      percentile_cont(0.5) WITHIN GROUP (ORDER BY multiplier_x),
      0
    ) AS med_x,
    COALESCE(AVG(multiplier_x), 0) AS avg_x
  FROM token_announcements
  WHERE NOT is_sponsored
  GROUP BY announcer_address
) stats
WHERE kp.address = stats.announcer_address;
