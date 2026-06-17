-- Phase 3: indexer-maintained per-token board stats (incremental on trade)
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/011_token_board_stats.sql
-- Backfill: sudo -u postgres psql -d pump_db -f db/refresh/backfill_token_board_stats.sql
-- Or (indexer): npm run backfill-board-stats

CREATE TABLE IF NOT EXISTS token_board_stats (
  token_address text PRIMARY KEY REFERENCES tokens(address) ON DELETE CASCADE,
  market_cap_zug numeric NOT NULL DEFAULT 0,
  spot_price_zug numeric NOT NULL DEFAULT 0,
  ath_market_cap_zug numeric NOT NULL DEFAULT 0,
  ath_price_zug numeric,
  reserve_zug numeric NOT NULL DEFAULT 0,
  token_sold numeric NOT NULL DEFAULT 0,
  progress_bps integer NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  holder_count integer NOT NULL DEFAULT 0,
  volume_24h_zug numeric NOT NULL DEFAULT 0,
  volume_24h_prev_zug numeric NOT NULL DEFAULT 0,
  trade_count_24h_ago integer NOT NULL DEFAULT 0,
  traders_24h integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_board_stats_mcap
  ON token_board_stats (market_cap_zug DESC);

CREATE INDEX IF NOT EXISTS idx_token_board_stats_updated
  ON token_board_stats (updated_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pump_indexer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON token_board_stats TO pump_indexer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pump_app') THEN
    GRANT SELECT ON token_board_stats TO pump_app;
  END IF;
END $$;
