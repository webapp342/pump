# ClickHouse (self-hosted OLAP) — Pump

**Role:** chart / trade history analytics.  
**Not for:** `user_positions`, wallets, favorites, auth, claims.

## Activate (VM)

Docker CE must be installed (script installs it if missing).

```bash
cd /var/www/pump/tma
# pull latest code (enable-clickhouse.sh with Docker installer), then:
bash deploy/vm/enable-clickhouse.sh
```

If Docker is still missing on an old checkout:

```bash
# one-shot Docker CE + compose (Ubuntu)
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
bash deploy/vm/enable-clickhouse.sh
```

This will:

1. `docker compose up -d` ClickHouse (2GB mem cap)
2. Apply `init/01_schema.sql` (trades_raw + MVs), `02_candles_spot.sql`, `03_trades_raw_spot_before.sql`
3. Chart history prefers **trades_raw argMin/argMax OHLC**; Redis hot tip for the open bucket
4. Patch `apps/indexer-sol/.env` — `CLICKHOUSE_*` + `REDIS_PUBLISH_ENABLED=true`
5. Patch TMA `.env` — `USE_CLICKHOUSE_CANDLES=true`
6. Restart indexer-sol + reload Next
7. Backfill PG trades → CH

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
