-- Pump OLAP schema (trades history + candle rollups).
-- Positions / wallets stay in PostgreSQL.

CREATE DATABASE IF NOT EXISTS pump;

CREATE TABLE IF NOT EXISTS pump.trades_raw
(
  event_id String,
  token_address String,
  trader_address String,
  side LowCardinality(String),
  sol_amount Float64,
  token_amount Float64,
  price_sol Float64,
  spot_price_sol Float64,
  fee_sol Float64,
  tx_hash String,
  log_index UInt32,
  slot UInt64,
  block_time DateTime64(3, 'UTC'),
  native_usd_rate Nullable(Float64)
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(block_time)
ORDER BY (token_address, block_time, tx_hash, log_index);

CREATE TABLE IF NOT EXISTS pump.candles_1m
(
  token_address String,
  bucket_start DateTime('UTC'),
  open_sol AggregateFunction(argMin, Float64, DateTime64(3, 'UTC')),
  high_sol AggregateFunction(max, Float64),
  low_sol AggregateFunction(min, Float64),
  close_sol AggregateFunction(argMax, Float64, DateTime64(3, 'UTC')),
  volume_sol AggregateFunction(sum, Float64),
  trade_count AggregateFunction(count, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket_start)
ORDER BY (token_address, bucket_start);

CREATE MATERIALIZED VIEW IF NOT EXISTS pump.candles_1m_mv
TO pump.candles_1m
AS
SELECT
  token_address,
  toStartOfMinute(block_time) AS bucket_start,
  argMinState(spot_price_sol, block_time) AS open_sol,
  maxState(spot_price_sol) AS high_sol,
  minState(spot_price_sol) AS low_sol,
  argMaxState(spot_price_sol, block_time) AS close_sol,
  sumState(sol_amount) AS volume_sol,
  countState() AS trade_count
FROM pump.trades_raw
GROUP BY token_address, bucket_start;
