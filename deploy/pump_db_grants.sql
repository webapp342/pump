-- Grants for pump_app (Next.js API) and pump_indexer (indexer)
-- Run as postgres: psql -d pump_db -f pump_db_grants.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pump_indexer') THEN
    CREATE USER pump_indexer WITH PASSWORD 'CHANGE_ME';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pump_app') THEN
    CREATE USER pump_app WITH PASSWORD 'CHANGE_ME';
  END IF;
END $$;

GRANT CONNECT ON DATABASE pump_db TO pump_indexer, pump_app;
GRANT USAGE ON SCHEMA public TO pump_indexer, pump_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pump_indexer, pump_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pump_indexer, pump_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pump_indexer, pump_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pump_indexer, pump_app;

GRANT EXECUTE ON FUNCTION launchpad_ensure_user(text, jsonb) TO pump_indexer, pump_app;
GRANT EXECUTE ON FUNCTION launchpad_award_points(text, text, text, text, date, jsonb) TO pump_indexer, pump_app;

-- Indexer runs REFRESH MATERIALIZED VIEW CONCURRENTLY (must be MV owner)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'mv_token_trade_stats' AND c.relkind = 'm'
  ) THEN
    ALTER MATERIALIZED VIEW mv_token_trade_stats OWNER TO pump_indexer;
    ALTER MATERIALIZED VIEW mv_token_price_anchors OWNER TO pump_indexer;
    GRANT SELECT ON mv_token_trade_stats TO pump_app;
    GRANT SELECT ON mv_token_price_anchors TO pump_app;
  END IF;
END $$;

COMMIT;
