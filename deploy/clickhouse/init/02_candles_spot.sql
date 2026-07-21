-- Authoritative spot OHLC (indexer-written, same semantics as PG token_candles).
-- Chart read path uses this table — NOT candles_5m MV min/max aggregates.

CREATE TABLE IF NOT EXISTS pump.candles_spot
(
  token_address String,
  candle_interval LowCardinality(String),
  bucket_start DateTime('UTC'),
  open_sol Float64,
  high_sol Float64,
  low_sol Float64,
  close_sol Float64,
  volume_sol Float64,
  buy_volume_sol Float64,
  trade_count UInt32,
  updated_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(bucket_start)
ORDER BY (token_address, candle_interval, bucket_start);
