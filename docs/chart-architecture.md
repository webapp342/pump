# Chart Architecture (2026-06)

Enterprise pump.fun-style charts: **native OHLC authoritative**, **USD display-only**.

## Data flow

```
Trade → indexer upsert token_candles (native spot OHLC)
      → Redis WS candleUpdates (1m,5m default)
      → GET /api/candles → gap_fill_candles SQL → Redis cache 5s
      → PriceChart: extend live tail + Lightweight Charts formatters (× nativeUsd)
```

## Rules

| Layer | Stores | Updates when |
|-------|--------|--------------|
| `token_candles.*_zug` | Native spot OHLC | Trades only |
| `close_usd` | Trade bucket USD snapshot | Trades (optional migration 027) |
| Header / chart USD | `nativeMark × nativeUsd` | Oracle 2s (client), trades (native) |
| Gap bars | SQL `gap_fill_candles` | Read-time flat at last close |

## Client (do not)

- Regap when API sent `gapFilled: true`
- `pinTail` / `reconcile` native OHLC against header
- Poll `curves()` for USD movement (use nativeUsd oracle)

## Client (do)

- `extendSeriesToLiveBucket` — append flat native buckets to now
- WS `merge_ws` — patch single bucket
- Actor optimistic — trader only, clear on WS confirm
- `useBnbUsdPrice` — 2s refetch for USD formatter

## VM deploy checklist

```bash
sudo -u postgres psql -d pump_db -f db/migrations/026_gap_fill_candles.sql
sudo -u postgres psql -d pump_db -f db/migrations/027_token_candles_usd.sql
# indexer .env: INCREMENTAL_CANDLES=true, CANDLE_WS_INTERVALS=1m,5m
npm run backfill-candles --workspace @pump/indexer  # if needed
```

## Tier C (future)

- Timescale continuous aggregates: 1m → 5m → 1h MV-on-MV
- Historical USD: backfill `close_usd` per bucket from Binance klines
