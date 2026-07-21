# Chart Architecture (2026-07)

Enterprise charts: **raw trades → OHLC**, **RAM live tip**, **Lightweight Charts `update()`**.

Aligned with TradingView LWC v5 docs + ClickHouse OHLC pattern
(`argMin` / `argMax` / `toStartOfInterval`).

## Data flow

```
Trade → indexer
      ├── PG trades (positions truth)
      ├── CH trades_raw (spot_before_sol + spot_price_sol, DateTime64 ms)
      ├── RAM tip + Redis hot + WS  (open immutable for bucket)
      └── optional dual-write candles_spot / PG token_candles (fallback only)

HTTP GET /api/candles
      → CH trades_raw GROUP BY interval
           open  = argMin(first print, block_time)
           high  = max(path)
           low   = min(path)
           close = argMax(last print, block_time)
      → merge Redis hot tip (open bucket SSOT)
      → gap-fill flat bars
      → fallback: candles_mv → candles_spot → PG → tape replay

PriceChart
      → setData(history) once per interval/load
      → series.update(tip) for live ticks (same time = replace tip)
      → never rewrite tip open client-side
```

## Rules

| Layer | Role |
|-------|------|
| `trades_raw.spot_before_sol` | First print / open + wick touch |
| `trades_raw.spot_price_sol` | Mark after trade / close |
| Redis `pump:hot:candle:*` | Live open-bucket OHLC (open frozen) |
| Client | No open stitch / repair; tip `update()` only |

## Client (do not)

- Prior-close stitch on open
- `Math.min` / repair-to-low on open
- `setData` on every live tip tick

## Client (do)

- `setData` on interval change / full history fetch
- WS `series.update` for same-bucket tip
- Actor optimistic — trader only; open frozen once set

## VM

```bash
docker exec -i pump-clickhouse clickhouse-client --multiquery \
  < deploy/clickhouse/init/03_trades_raw_spot_before.sql
systemctl restart pump-indexer-sol
# optional: flush stale tips
redis-cli --scan --pattern 'pump:hot:candle:*' | xargs -r redis-cli DEL
```

See also: [`docs/ultra-fast-ui-phases.md`](./ultra-fast-ui-phases.md)
