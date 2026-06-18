-- Tier 3: scale indexes (CONCURRENTLY — safe on production)
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/012_tier3_scale_indexes.sql

-- Movers board: volume + updated_at for token_board_stats path
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_board_stats_volume_24h
  ON public.token_board_stats (volume_24h_zug DESC)
  WHERE volume_24h_zug > 0;

-- Arena age sort on visible tokens (complements idx_tokens_visible_created)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_visible_status_created
  ON public.tokens (status, created_at DESC)
  WHERE is_hidden = false;

-- Portfolio / wallet positions by address (open positions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_positions_address_balance
  ON public.user_positions (address, token_balance DESC)
  WHERE token_balance > 0;

-- Recent trades tape (token detail)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_token_time_desc
  ON public.trades (token_address, block_time DESC, log_index DESC);
