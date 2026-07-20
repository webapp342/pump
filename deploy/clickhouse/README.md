# ClickHouse (self-hosted OLAP) — Pump

**Role:** chart / trade history analytics.  
**Not for:** `user_positions`, wallets, favorites, auth, claims.

## Activate (VM)

```bash
cd /var/www/pump/tma
# pull latest code first, then:
bash deploy/vm/enable-clickhouse.sh
```

This will:

1. `docker compose up -d` ClickHouse (2GB mem cap)
2. Apply `init/01_schema.sql` (trades_raw + 1m/5m/15m/1h/4h MVs)
3. Patch `apps/indexer-sol/.env` — `CLICKHOUSE_*` + `REDIS_PUBLISH_ENABLED=true`
4. Patch TMA `.env` — `USE_CLICKHOUSE_CANDLES=true`
5. Restart indexer-sol + reload Next
6. Backfill PG trades → CH

## Verify

```bash
curl -sf http://127.0.0.1:8123/ping
docker exec pump-clickhouse clickhouse-client -q "SELECT count() FROM pump.trades_raw"
journalctl -u pump-indexer-sol -n 20 --no-pager
```

## Disable

```bash
# indexer-sol .env
CLICKHOUSE_DUAL_WRITE=false
# web .env
USE_CLICKHOUSE_CANDLES=false
docker compose -f deploy/clickhouse/docker-compose.yml stop
```
