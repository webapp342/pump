# Pump — Ops & Performans Playbook

**Amaç:** Kurumsal seviye ultra-hızlı UX için ne yaptık, VM durumu, haftalık ritüel ve sonraki adım kapıları.  
**VM:** `104.207.64.115` · SSH `22022` · DB host adı: `db`

İlgili: [`ultra-fast-strategy-2026.md`](../.cursor/docs/ultra-fast-strategy-2026.md) · [`perf-baseline.md`](./perf-baseline.md)

---

## Tier durumu (Haziran 2026)

| Tier | Durum | Not |
|------|--------|-----|
| **1** Cache Components + PPR | ✅ | `cacheComponents: true`, arena/portfolio SSR |
| **2** WS seq, rAF, token bundle | ✅ | |
| **3** PgBouncer, PM2 2×2, read URL, watchBlocks | ✅ VM’de aktif | |
| **4** Bonding machine + local-first | ✅ kod | Zero / Edge / PG18 → **ertelendi** |

**Şu an faz:** Solana + P/L ledger + **ClickHouse OLAP aktifleştirilebilir** (`enable-clickhouse.sh`). Zero / Edge WS / PG18 hâlâ SLO kapılı.

---

## Solana cutover (VM)

```bash
bash /var/www/pump/tma/deploy/vm/solana-cutover-cleanup.sh
# stops/disables pump-indexer + pump-airdrop-keeper; removes Alto from PM2;
# enables pump-indexer-sol
```

Health: `system-health.sh` skips Alto / EVM indexer / airdrop keeper when `NEXT_PUBLIC_CHAIN_FAMILY=solana`.

**ClickHouse (self-hosted OLAP — activate on VM):**

```bash
bash /var/www/pump/tma/deploy/vm/enable-clickhouse.sh
```

Sets dual-write + `USE_CLICKHOUSE_CANDLES` + Redis publish. Positions stay in PostgreSQL.

**P/L / cost basis (indexer-sol):**

```bash
cd /var/www/pump/tma
npm run backfill-cost-basis -w @pump/indexer-sol
npm run check-position-invariants -w @pump/indexer-sol
# Opsiyonel drift teşhisi (gate değil):
# npm run check-chart-parity -w @pump/indexer-sol
# SKIP_PG: operatör kararı — see guncelleme-ilerleme.md#decision-no-parity-gate
```

### Açık env flag’leri (doğrulandı)

**TMA** (`/var/www/pump/tma/.env`):

- `USE_REDIS_ARENA_CACHE`
- `USE_TOKEN_BOARD_STATS`
- `USE_BONDING_STATE_COUNTS`
- `USE_MV_TOKEN_STATS`
- `PGBOUNCER_ENABLED=true`
- `LAUNCHPAD_DATABASE_READ_URL`
- `NEXT_PUBLIC_CHAIN_FAMILY=solana` *(prod cutover)*
- `USE_CLICKHOUSE_CANDLES=true` *(after enable-clickhouse.sh)*
- `CLICKHOUSE_URL=http://127.0.0.1:8123`

**Indexer Solana** (`apps/indexer-sol/.env`):

- `INCREMENTAL_BOARD_STATS=true`
- `REDIS_PUBLISH_ENABLED=true` *(required for live board)*
- `CLICKHOUSE_URL=http://127.0.0.1:8123`
- `CLICKHOUSE_DUAL_WRITE=true` *(or omit — URL alone enables)*

**Bundler (Alto):** Solana’da **kullanılmaz** — `solana-cutover-cleanup.sh` ile PM2’den kaldır. EVM rollback için unit/docs duruyor.

**Admin console (MetaMask, `/admin/`):**

- Prod: **http://104.207.64.115/admin/** (nginx + CI build)
- Local dev: `npm run dev:admin` → :5174
- Nginx one-time: `deploy/nginx-pump.conf` içindeki `/admin/` bloğu
- Ana TMA’da `/admin` route yok; ops wallet = `NEXT_PUBLIC_ADMIN_ADDRESS`

---

## Haftalık ritüel (senin checklist)

Her **Pazartesi** veya deploy sonrası:

```bash
# 1) Tam health JSON
ssh -p 22022 root@104.207.64.115 \
  "bash /var/www/pump/tma/deploy/vm/system-health.sh" | jq '{overall, checkedAt, cpu: .hostMetrics.cpu, mem: .hostMetrics.memory, checks: [.checks[] | {id, status, latencyMs}]}'

# 2) Yavaş sorgular + API latency
ssh -p 22022 root@104.207.64.115 \
  "bash /var/www/pump/tma/deploy/vm/phase-0-observability.sh"

# 3) Dışarıdan API (Windows)
curl.exe -w "tokens_ms=%{time_total}\n" -o NUL "http://104.207.64.115/api/tokens?limit=50&filter=new"

# 4) Indexer canlı mı (Solana)
ssh -p 22022 root@104.207.64.115 \
  "journalctl -u pump-indexer-sol -n 5 --no-pager"
```

**UI:** Admin cüzdan → **System Health** (`/api/admin/system-health`).

**Kayıt:** Sonuçları [`perf-baseline.md`](./perf-baseline.md) dosyasına tarih + 3 satır özet ekle.

---

## SLO alarmları (kırmızı çizgi)

| Metrik | Alarm eşiği | Aksiyon |
|--------|-------------|---------|
| `/api/tokens` P95 | > 80 ms | Redis cache, read replica, sorgu audit |
| Arena WS → UI patch P95 | > 100 ms | Realtime / nginx incele |
| Eşzamanlı WS | > 2000 sürekli | Edge WS değerlendir ([tier4-edge-ws](../.cursor/docs/tier4-edge-ws-evaluation.md)) |
| CPU sürekli | > 70% | MV refresh, indexer, PG tuning |
| Quote-fill sapması P99 | > slippage + 50 bps | TradePanel / curve machine |

---

## Adım 3 kapıları (büyük hamle — şimdilik KAPALI)

VM 2026-06-18 ölçümüne göre **hiçbiri acil değil**:

| Hamle | Ne zaman aç | Bugün |
|-------|-------------|--------|
| **A) Rocicorp Zero** | Favorites/portfolio/cross-device sync yavaş | API ~2 ms · local-first kodda → ⏸️ |
| **B) Edge WS** | WS > 2000 veya global WS P95 > 100 ms | WS 14 ms · CPU %1 → ⏸️ |
| **C) PG 18 + pg_trickle** | MV refresh CPU yiyor | CPU %1 · incremental stats açık → ⏸️ |
| **D) ClickHouse OLAP** | Chart history / trades scale | **Activate:** `enable-clickhouse.sh` + `candles_spot` authoritative OHLC — [`ultra-fast-ui-phases.md`](./ultra-fast-ui-phases.md) |

**Kilitli hybrid:** PostgreSQL = OLTP (positions, wallets, auth). ClickHouse = yalnızca trades/OHLCV history. Tüm DB’yi CH’ye taşımak yok.

Karar vermeden önce bu dosyadaki SLO tablosuna bak.

---

## Deploy hatırlatması

- CI: `main` push → GitHub Actions → `deploy/tma-deploy.sh`
- Indexer sync: `deploy/vm/indexer-deploy.sh` (tma-deploy içinde otomatik)
- Build kırılırsa: Next.js Cache Components + `AppShell` / Suspense — [`airdrops/[id]` örneği](../src/app/airdrops/[id]/page.tsx)

---

## Tarihçe

| Tarih | Not |
|-------|-----|
| 2026-07-20 | Solana P/L cost-basis USD parity; Alto/EVM health skip; CH compose scaffold (dual-write off). |
| 2026-06-18 | İlk playbook snapshot. Tier 3 VM doğrulandı. Adım 3 ertelendi. Deploy fix `7dc6be5` (airdrops prerender). |

---

*Güncelleme: Her haftalık ölçümden sonra “Son VM snapshot” ve “Tarihçe” satırını güncelle.*
