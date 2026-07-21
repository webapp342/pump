-- Solana base58 mints are case-sensitive — gap_fill must not lower() non-EVM addresses.

CREATE OR REPLACE FUNCTION public.gap_fill_candles(
  p_token_address text,
  p_interval text,
  p_limit integer DEFAULT 1000,
  p_end_ts timestamptz DEFAULT now()
)
RETURNS TABLE (
  bucket_sec bigint,
  open_zug numeric,
  high_zug numeric,
  low_zug numeric,
  close_zug numeric,
  volume_zug numeric,
  buy_volume_zug numeric,
  trade_count integer
)
LANGUAGE sql
STABLE
AS $$
  WITH interval_secs AS (
    SELECT CASE p_interval
      WHEN '15s' THEN 15
      WHEN '1m' THEN 60
      WHEN '5m' THEN 300
      WHEN '15m' THEN 900
      WHEN '1h' THEN 3600
      WHEN '4h' THEN 14400
      ELSE 60
    END AS secs
  ),
  addr AS (
    SELECT CASE
      WHEN p_token_address LIKE '0x%' THEN lower(p_token_address)
      ELSE p_token_address
    END AS token_address
  ),
  stored AS (
    SELECT
      (EXTRACT(EPOCH FROM tc.bucket_ts))::bigint AS bucket_sec,
      tc.open_zug,
      tc.high_zug,
      tc.low_zug,
      tc.close_zug,
      tc.volume_zug,
      tc.buy_volume_zug,
      tc.trade_count
    FROM token_candles tc
    CROSS JOIN addr a
    WHERE tc.token_address = a.token_address
      AND tc.candle_interval = p_interval
    ORDER BY tc.bucket_ts DESC
    LIMIT GREATEST(1, LEAST(p_limit, 4000))
  ),
  stored_asc AS (
    SELECT * FROM stored ORDER BY bucket_sec ASC
  ),
  bounds AS (
    SELECT
      (SELECT MIN(s.bucket_sec) FROM stored_asc s) AS start_sec,
      (SELECT MAX(s.bucket_sec) FROM stored_asc s) AS last_trade_sec,
      (SELECT secs FROM interval_secs) AS interval_sec
  ),
  end_bound AS (
    SELECT
      GREATEST(
        b.last_trade_sec,
        (EXTRACT(EPOCH FROM date_trunc('second', p_end_ts))::bigint / b.interval_sec) * b.interval_sec
      ) AS end_sec,
      b.start_sec,
      b.interval_sec
    FROM bounds b
  ),
  windowed AS (
    SELECT
      eb.start_sec,
      eb.end_sec,
      eb.interval_sec,
      GREATEST(
        eb.start_sec,
        eb.end_sec - (GREATEST(1, LEAST(p_limit, 4000)) - 1) * eb.interval_sec
      ) AS series_start_sec
    FROM end_bound eb
    WHERE eb.start_sec IS NOT NULL
  ),
  series AS (
    SELECT generate_series(w.series_start_sec, w.end_sec, w.interval_sec) AS bucket_sec
    FROM windowed w
  ),
  joined AS (
    SELECT
      s.bucket_sec,
      sa.open_zug AS raw_open,
      sa.high_zug AS raw_high,
      sa.low_zug AS raw_low,
      sa.close_zug AS raw_close,
      sa.volume_zug AS raw_volume,
      sa.buy_volume_zug AS raw_buy_volume,
      sa.trade_count AS raw_trade_count
    FROM series s
    LEFT JOIN stored_asc sa ON sa.bucket_sec = s.bucket_sec
  ),
  carried AS (
    SELECT
      j.bucket_sec,
      j.raw_open,
      j.raw_high,
      j.raw_low,
      j.raw_close,
      j.raw_volume,
      j.raw_buy_volume,
      j.raw_trade_count,
      MAX(j.raw_close) FILTER (WHERE j.raw_close IS NOT NULL AND j.raw_close > 0)
        OVER (ORDER BY j.bucket_sec ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS last_close
    FROM joined j
  )
  SELECT
    c.bucket_sec,
    COALESCE(c.raw_open, c.last_close) AS open_zug,
    COALESCE(c.raw_high, c.last_close) AS high_zug,
    COALESCE(c.raw_low, c.last_close) AS low_zug,
    COALESCE(c.raw_close, c.last_close) AS close_zug,
    COALESCE(c.raw_volume, 0) AS volume_zug,
    COALESCE(c.raw_buy_volume, 0) AS buy_volume_zug,
    COALESCE(c.raw_trade_count, 0)::integer AS trade_count
  FROM carried c
  WHERE c.last_close IS NOT NULL AND c.last_close > 0
  ORDER BY c.bucket_sec ASC;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pump_app') THEN
    GRANT EXECUTE ON FUNCTION public.gap_fill_candles(text, text, integer, timestamptz) TO pump_app;
  END IF;
END $$;
