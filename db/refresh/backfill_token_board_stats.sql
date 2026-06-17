-- One-shot backfill for token_board_stats (phase 3)
-- Run: sudo -u postgres psql -d pump_db -f db/refresh/backfill_token_board_stats.sql
-- Requires: 011_token_board_stats.sql applied; mv_token_trade_stats refreshed at least once (optional).

INSERT INTO token_board_stats (
  token_address,
  market_cap_zug,
  spot_price_zug,
  ath_market_cap_zug,
  ath_price_zug,
  reserve_zug,
  token_sold,
  progress_bps,
  trade_count,
  holder_count,
  volume_24h_zug,
  volume_24h_prev_zug,
  trade_count_24h_ago,
  traders_24h,
  updated_at
)
SELECT
  b.token_address,
  CASE
    WHEN (1000000000::numeric - COALESCE(b.token_sold, 0)) > 0
    THEN ((5::numeric + COALESCE(b.reserve_zug, 0))
         / (1000000000::numeric - COALESCE(b.token_sold, 0)))
         * 1000000000
    ELSE COALESCE(b.market_cap_zug, 0)
  END AS market_cap_zug,
  CASE
    WHEN (1000000000::numeric - COALESCE(b.token_sold, 0)) > 0
    THEN (5::numeric + COALESCE(b.reserve_zug, 0))
         / (1000000000::numeric - COALESCE(b.token_sold, 0))
    ELSE COALESCE(b.last_price_zug, 0)
  END AS spot_price_zug,
  GREATEST(
    COALESCE(b.market_cap_zug, 0),
    CASE
      WHEN (1000000000::numeric - COALESCE(b.token_sold, 0)) > 0
      THEN ((5::numeric + COALESCE(b.reserve_zug, 0))
           / (1000000000::numeric - COALESCE(b.token_sold, 0)))
           * 1000000000
      ELSE 0
    END
  ) AS ath_market_cap_zug,
  COALESCE(ts.ath_price_zug, b.last_price_zug) AS ath_price_zug,
  COALESCE(b.reserve_zug, 0) AS reserve_zug,
  COALESCE(b.token_sold, 0) AS token_sold,
  COALESCE(b.progress_bps, 0) AS progress_bps,
  COALESCE(b.trade_count, 0) AS trade_count,
  COALESCE(b.holder_count, 0) AS holder_count,
  COALESCE(ts.volume_24h_zug, 0) AS volume_24h_zug,
  COALESCE(ts.volume_24h_prev_zug, 0) AS volume_24h_prev_zug,
  COALESCE(ts.trade_count_24h_ago, 0) AS trade_count_24h_ago,
  COALESCE(ts.traders_24h, 0) AS traders_24h,
  now() AS updated_at
FROM bonding_states b
JOIN tokens t ON t.address = b.token_address AND t.is_hidden = false
LEFT JOIN mv_token_trade_stats ts ON ts.token_address = b.token_address
ON CONFLICT (token_address) DO UPDATE SET
  market_cap_zug = EXCLUDED.market_cap_zug,
  spot_price_zug = EXCLUDED.spot_price_zug,
  ath_market_cap_zug = GREATEST(
    token_board_stats.ath_market_cap_zug,
    EXCLUDED.ath_market_cap_zug
  ),
  ath_price_zug = GREATEST(
    COALESCE(token_board_stats.ath_price_zug, 0),
    COALESCE(EXCLUDED.ath_price_zug, 0)
  ),
  reserve_zug = EXCLUDED.reserve_zug,
  token_sold = EXCLUDED.token_sold,
  progress_bps = EXCLUDED.progress_bps,
  trade_count = EXCLUDED.trade_count,
  holder_count = EXCLUDED.holder_count,
  volume_24h_zug = EXCLUDED.volume_24h_zug,
  volume_24h_prev_zug = EXCLUDED.volume_24h_prev_zug,
  trade_count_24h_ago = EXCLUDED.trade_count_24h_ago,
  traders_24h = EXCLUDED.traders_24h,
  updated_at = now();
