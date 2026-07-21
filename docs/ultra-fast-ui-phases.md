# Ultra-Fast UI/UX — Enterprise Phased Plan (2026-07)

**Goals:** lag-free live updates · spot/fill/chart consistency · minimal VM load (PG CPU, indexer) · ClickHouse for chart history · Redis for hot path · WS for fan-out.

**SLO targets** (single VM Tier 3):

| Metric | Target |
|--------|--------|
| WS event → UI patch P95 | < 50 ms |
| Chart first paint (SSR + tail) | < 200 ms |
| `/api/tokens/[addr]/candles` P95 (cache hit) | < 15 ms |
| Chart OHLC vs bonding spot drift | < 0.1% (10 bps) |
| PG chart read load | 0 (CH authoritative) |

---

## Data layer contract

```
                    ┌─────────────────────────────────────┐
                    │           Indexer-sol               │
                    │  compute OHLC once (touchPrices)    │
                    └──────────┬──────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   PostgreSQL            ClickHouse              Redis
   (OLTP truth)         (chart history)      (hot + pub/sub)
   · trades             · candles_spot *     · pump:trade:*
   · positions          · trades_raw         · pump:hot:candle:*
   · bonding_states                          · pump:hot:tape:*
   · token_candles*                          · pump:cache:*
         │                     │                     │
         │                     │                     ▼
         │                     │              apps/realtime WS
         │                     ▼                     │
         │              GET /api/candles             │
         └─────────────────────────────────────────────┘
                              ▼
                        PriceChart (LWC)
```

\* `token_candles` PG writes optional (parity ops); chart **read path** never hits PG.

---

## Phase 1 — Chart truth pipeline (P0) ✅ implementing

**Problem:** CH MV `min/max(spot)` ≠ PG indexer OHLC → refresh wicks / scale drift.

**Deliverables:**

1. `pump.candles_spot` ReplacingMergeTree — indexer writes **same OHLC** as PG upsert.
2. Web chart API reads `candles_spot` first; MV `candles_5m` fallback only.
3. `backfill-clickhouse-candles` — PG `token_candles` → `candles_spot`.
4. `check-chart-parity` extended to compare CH authoritative vs bonding spot.

**VM:**

```bash
docker exec -i pump-clickhouse clickhouse-client --multiquery < deploy/clickhouse/init/02_candles_spot.sql
npm run backfill-clickhouse-candles -w @pump/indexer-sol
systemctl restart pump-indexer-sol && pm2 reload pump-tma --update-env
```

---

## Phase 2 — Redis hot path (P0)

**Goal:** first paint + live tail without CH/PG round-trip.

| Key | TTL | Writer | Reader |
|-----|-----|--------|--------|
| `pump:hot:candle:{mint}:{interval}` | 600s | indexer publish | `/api/candles` merge tail |
| `pump:hot:tape:{mint}` | 300s | indexer publish | token tape SSR |
| `pump:cache:candles:{mint}:{iv}` | 5s | web API | chart poll |

**Already live:** `pump:trade:*` pub/sub → realtime WS → `candleUpdates` in payload.

---

## Phase 3 — PG load reduction (P1)

1. `SKIP_PG_TOKEN_CANDLES=true` — indexer skips PG candle INSERT (CH + Redis only) after parity green 7d.
2. Fix `gap_fill_candles()` — Solana base58 (no `lower()`).
3. Tape pagination: page 1 Redis, older pages CH `trades_raw`.

---

## Phase 4 — API & cache polish (P1)

1. Arena board: `USE_REDIS_ARENA_CACHE` full board snapshot 2s TTL.
2. Token bundle SSR: Redis snapshot before PG.
3. Candle API: prefer authoritative CH → merge Redis hot tail → gap-fill once.

---

## Phase 5 — Observability & ops (P2)

1. Weekly: `check-chart-parity`, `check-position-invariants`, `system-health.sh`.
2. Log chart source: `olap: candles_spot | candles_mv | postgres | trades_replay`.
3. Alert: `CHART_DRIFT_BPS > 10` or `low/close ratio < 0.25` in any live bucket.

---

## Phase 6 — Scale gates (SLO breach only)

Per `docs/ops-perf-playbook.md`:

- Edge WS when concurrent WS > 2000
- Zero RPC when favorites/portfolio cross-device slow
- PG 18 pg_trickle when CPU > 70% from MV refresh

---

## Price semantics (never break)

| Surface | Semantics |
|---------|-----------|
| Header / chart OHLC | **Spot** (bonding marginal) |
| Trade tape Price | **Fill** (execution) |
| Trade panel quote | **Quote** (~Est.) |

Chart rules: native OHLC in store; USD = `× nativeUsd` in formatter only; wick guard 4× on live tail.

---

## Implementation status

| Phase | Status |
|-------|--------|
| 1 Chart truth (CH candles_spot) | ✅ code shipped |
| 2 Redis hot tail + tape ring | ✅ code shipped |
| 3 PG load reduction (`SKIP_PG_TOKEN_CANDLES`) | planned |
| 4 API polish (arena Redis-first) | planned |
| 5 Observability | planned |
| 6 Scale gates | deferred |
