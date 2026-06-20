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

**Şu an faz:** Post-Tier 4 — ölçüm disiplini + UX cilası. Büyük infra (Zero, Edge WS, PG 18) **gerekli değil** (VM metrikleri aşağıda).

---

## Son VM snapshot — 2026-06-18

`bash deploy/vm/system-health.sh` + dış API probu.

| Metrik | Değer | SLO hedefi | Durum |
|--------|-------|------------|--------|
| CPU (8 core) | ~1% | — | ✅ |
| RAM | ~14% kullanım | — | ✅ |
| Disk `/` | ~7% | — | ✅ |
| `/api/health` (public) | ~2.2 ms | — | ✅ |
| `/api/tokens` (public) | ~2.1 ms | P95 < 80 ms | ✅ |
| TMA local health | 7 ms | — | ✅ |
| PostgreSQL SELECT 1 | 66 ms | — | ✅ |
| WS smoke (1 conn) | 14 ms | P95 < 50 ms | ✅ |
| PG aktif bağlantı | 13 | — | ✅ |
| PM2 | 2× pump-tma + 2× pump-realtime | Tier 3 | ✅ |
| PgBouncer | active `:6432` | Tier 3 | ✅ |
| Indexer | `watchBlocks(wss://…)` · bloklar canlı | — | ✅ |

**system-health `overall: degraded` uyarısı:** Indexer log parse (`mode=` satırı) — indexer gerçekte sağlıklı. `journalctl -u pump-indexer -n 5` ile doğrula.

### Açık env flag’leri (doğrulandı)

**TMA** (`/var/www/pump/tma/.env`):

- `USE_REDIS_ARENA_CACHE`
- `USE_TOKEN_BOARD_STATS`
- `USE_BONDING_STATE_COUNTS`
- `USE_MV_TOKEN_STATS`
- `PGBOUNCER_ENABLED=true`
- `LAUNCHPAD_DATABASE_READ_URL`

**Indexer** (`/var/www/pump/Indexer/.env`):

- `INCREMENTAL_BOARD_STATS=true`
- `INDEXER_USE_WS_BLOCKS=true`
- `REDIS_PUBLISH_ENABLED`
- `MV_REFRESH_ENABLED=true` *(CPU düşükken OK; %50+ olunca gözden geçir)*

**Bundler (Alto, VM):**

- `BUNDLER_RPC_URL=http://127.0.0.1:4337/rpc` — no `PIMLICO_API_KEY`
- `BUNDLER_CHAIN_RPC_URL` — paid Alchemy/PAYG on VM only (not dataseed)
- Health: `bash deploy/bundler/alto/health.sh`
- Docs: `.cursor/docs/self-hosted-bundler-2026.md`

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

# 4) Indexer canlı mı
ssh -p 22022 root@104.207.64.115 \
  "journalctl -u pump-indexer -n 5 --no-pager"
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
| 2026-06-18 | İlk playbook snapshot. Tier 3 VM doğrulandı. Adım 3 ertelendi. Deploy fix `7dc6be5` (airdrops prerender). |

---

*Güncelleme: Her haftalık ölçümden sonra “Son VM snapshot” ve “Tarihçe” satırını güncelle.*
