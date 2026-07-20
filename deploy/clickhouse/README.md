# ClickHouse (self-hosted OLAP) — Pump

**Role:** chart / trade history analytics only.  
**Not for:** `user_positions`, wallets, favorites, auth, claims.

## When to enable

Gate (from ops playbook): PG chart history P95 degraded OR `token_candles` / `trades` growth hurts SSR.

Until then keep compose **stopped** and `CLICKHOUSE_DUAL_WRITE` unset/false.

## Start

```bash
cd /var/www/pump/tma
docker compose -f deploy/clickhouse/docker-compose.yml up -d
# apply schema if image did not auto-run init:
docker exec -i pump-clickhouse clickhouse-client --multiquery < deploy/clickhouse/init/01_schema.sql
```

## Indexer dual-write

In `apps/indexer-sol/.env`:

```env
CLICKHOUSE_URL=http://127.0.0.1:8123
CLICKHOUSE_DUAL_WRITE=true
CLICKHOUSE_DATABASE=pump
```

Restart `pump-indexer-sol`. Trades still commit to Postgres first; CH insert is async and best-effort.

## Memory

`config/memory.xml` caps server RAM ratio; compose `mem_limit: 2g`.
