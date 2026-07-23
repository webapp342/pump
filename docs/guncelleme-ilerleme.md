# Güncelleme İlerleme Günlüğü

**Master plan:** [`guncelleme-master-plan.md`](./guncelleme-master-plan.md)  
**Analiz:** [`guncelleme-analiz-ve-plan.md`](./guncelleme-analiz-ve-plan.md)

> Her faz bitince ilgili bölüme **LOG** entry ekle. Sorun olunca **INCIDENT** bloğu aç.  
> Format: tarih UTC+4:30 · commit SHA · env değişiklikleri · komutlar · sonuç · sonraki adım.

---

## Durum özeti (canlı)

| Faz | Ad | Durum | Başlangıç | Bitiş | Not |
|-----|-----|--------|-----------|-------|-----|
| F0 | Spec + CH ops | 🟢 **Done** | 2026-07-23 | 2026-07-23 | CH candles_spot=26, trades_raw=360 |
| F1 | Redis XP + clans | 🟢 **Done (VM smoke)** | 2026-07-23 | 2026-07-24 | ZSCORE/ZREVRANGE + weekly API OK |
| F2 | Redis→CH flusher | 🟢 **Stream ON** | 2026-07-23 | — | XLEN pump:ch:trades=23, flusher online |
| F3 | Program fee v2 | 🟢 **Done (devnet)** | 2026-07-23 | 2026-07-24 | F4b redeploy pending (IX 12/13) |
| F4 | Sezon settlement | 🟡 **F4b coded** | 2026-07-23 | — | worker + claim UI; VM deploy bekliyor |
| F5 | Go indexer + LaserStream | 🟡 **F5c coded** | 2026-07-24 | — | VM: GO_SHADOW_MODE=primary + smoke |
| F6 | PG offload + TS cutover | 🟢 **SKIP_PG ON** | 2026-07-23 | — | web+indexer SKIP_PG_TOKEN_CANDLES=true |
| F7 | Jupiter + portfolio CH | 🟢 **Price worker done** | 2026-07-23 | — | Redis SOL ~76 USD |
| F8 | Hardening | ⬜ Ongoing | — | — | |

**Kritik yol:** CH backfill + stream → F2 cutover → F1 XP smoke → F3 deploy → F5/F6.  
**~~7 gün chart-parity gate~~ → İPTAL (2026-07-23)** — beklenmeyecek; aşağıdaki [karar](#decision-no-parity-gate).

Durum ikonları: ⬜ Pending · 🟡 In progress · 🟢 Done · 🔴 Blocked · ⏸ Paused

---

<a id="decision-no-parity-gate"></a>
### KARAR — Chart parity gate iptal (2026-07-23)

| Eski kural | Yeni kural |
|------------|------------|
| 7 gün `check-chart-parity` green → `SKIP_PG_TOKEN_CANDLES` | **Yok** — operatör cutover kararı |
| `compared_ch > 0` F0/F2 bloker | **Yok** — CH ping + backfill + canlı indexer yeterli |
| Günlük parity cron zorunlu | **Opsiyonel** teşhis (`npm run check-chart-parity` isteğe bağlı) |

**Cutover sırası (hızlı yol):**
1. CH ayakta + `backfill-clickhouse-candles` (OOM fix memory.xml)
2. Web: `USE_CLICKHOUSE_CANDLES=true`, `REDIS_URL`
3. Indexer: `CLICKHOUSE_VIA_REDIS_STREAM=true` + `pump-ch-flusher` online
4. İsteğe bağlı: `SKIP_PG_TOKEN_CANDLES=true` (PG mirror kapat — rollback: flag kaldır + restart indexer)
5. Canlı mum: Redis hot + WS (parity script değil)

---

## VM baseline snapshot (2026-07-23 — güncel)

**Kaynak:** `solana-only-audit.sh` + `system-health.sh` · commit `c32a2b4`

```text
Host: instance-20260713-123055
Chain: NEXT_PUBLIC_CHAIN_FAMILY=solana · SKIP_EVM_INDEXER=1 · SKIP_ALTO_BUNDLER=1

Servisler (Solana prod):
  pump-indexer-sol: active
  pump-tma / pump-realtime / pump-ch-flusher / pump-price-worker: pm2 online
  pump-indexer / pump-airdrop-keeper: inactive (disabled)
  pump-clickhouse: Up (healthy)
  /var/www/pump/Indexer → arşivlendi (Indexer.evm-archived.20260723)

CH: candles_spot=26 · trades_raw=360 · ping Ok
Redis: PONG · price:native:sol:usd ~76 USD · XLEN pump:ch:trades=23 · ZCARD weekly_user_xp=3
Indexer lag: solana_indexer slot ~478340342 · age ~1s

Env (aktif):
  web: USE_CLICKHOUSE_CANDLES=true · SKIP_PG_TOKEN_CANDLES=true · REDIS_URL · WS enabled
  indexer-sol: CLICKHOUSE_VIA_REDIS_STREAM=true · CLICKHOUSE_DUAL_WRITE=true · SKIP_PG=true

system-health: overall=healthy (postgres, redis, nginx, tma, realtime, ws, indexer-sol, clickhouse)
EVM web .env: 7 legacy key silindi (APPLY=1 cleanup) · indexer-sol EVM=0
```

---

## VM baseline snapshot (2026-07-22 — tarihsel)

**Kaynak:** prod SSH diagnostik — INC-001 dönemi referans.

```text
Host: instance-20260713-123055 (104.207.64.115)
ClickHouse: pump-clickhouse Up 2d (healthy), ping Ok.
Web .env: USE_CLICKHOUSE_CANDLES=true, CLICKHOUSE_URL=http://127.0.0.1:8123
Indexer .env: CLICKHOUSE_DUAL_WRITE=true, SKIP_PG yok (PG mirror AÇIK)

PG token_candles (46eTNC...): 5m=12, 15m=7, 1h=4, 4h=2
CH candles_spot (same token): BOŞ
check-chart-parity: compared_ch=0 compared_pg=2 ch_enabled=true

CH sorgular: MEMORY_LIMIT_EXCEEDED (~716MB query limit)
chart_olap_source: olap=postgres (çoğunluk), 1× candles_mv

Sonuç: CH container ayakta ama veri yok + okunamıyor → F0 bloker
```

---

<a id="f0"></a>
## F0 — Spec kilidi + ClickHouse ops

**Plan:** [`guncelleme-master-plan.md` §2](./guncelleme-master-plan.md#2-f0--spec-kilidi--clickhouse-ops)

### Checklist

- [x] `docs/fee-split-v2-spec.md`
- [x] `docs/redis-key-catalog.md`
- [x] `docs/ingest-cutover-runbook.md`
- [x] CH memory.xml ≥ 0.55 (repo + VM mount)
- [x] backfill-clickhouse-candles + trades (VM) — candles_spot=26 (kısmi yeterli; büyüdükçe tekrar backfill)
- [x] ~~check-chart-parity 7d gate~~ — **iptal** (opsiyonel teşhis)
- [ ] pm2 logs olap ≠ postgres (VM) — izleme devam

### LOG

#### 2026-07-23 ~19:00 — F0 VM yeşil (INC-001 mitigated)

- **Commit:** `c32a2b4`
- **Host:** instance-20260713-123055
- **Metrikler:**
  - `candles_spot` count=**26**, `trades_raw`=**360**
  - CH ping Ok · memory.xml ≥0.55 (container healthy 15h+)
- **Karar:** parity 7d gate iptal — F0 “CH dolu + stream” ile done sayıldı
- **Sonraki:** yeni tokenlar için periyodik backfill; chart `olap` log izle

#### 2026-07-23 ~04:10 — F0 VM denemesi (INC-001 devam)

- **Host:** instance-20260713-123055
- **Komutlar:** `docker restart pump-clickhouse` + backfill aynı blokta (hatalı sıra)
- **Sonuç:**
  - backfill: pg rows=34, insert sırasında `other side closed` (CH restart)
  - verify: `candles_spot` count=26
  - parity: `compared_ch=0 compared_pg=2 ch_enabled=true` — exit 1
- **Sonraki:** `bash deploy/vm/f0-ch-recover.sh` (CH stabil → backfill → parity)

#### 2026-07-23 — F0 repo implementasyonu (local)

- **Commit:** (uncommitted)
- **Yapan:** agent
- **Değişen dosyalar:**
  - `deploy/clickhouse/config/memory.xml` — ratio 0.35 → **0.55**
  - `docs/fee-split-v2-spec.md`, `docs/redis-key-catalog.md`, `docs/ingest-cutover-runbook.md`
- **Env (VM):** henüz uygulanmadı
- **Sonraki:** VM'de CH restart + backfill + parity

### INCIDENT

#### INC-001 — CH OOM + boş candles_spot (2026-07-22)

| Alan | Detay |
|------|--------|
| **Belirti** | `MEMORY_LIMIT_EXCEEDED` full table ve token-scoped count; candles_spot empty |
| **Kök neden** | (1) memory.xml ratio 0.35 çok düşük (2) dual-write CH insert sessiz fail / hiç veri yok (3) backfill yapılmamış |
| **Etki** | Chart 100% PG fallback despite USE_CLICKHOUSE_CANDLES=true |
| **Fix planı** | F0: memory ↑, backfill, stream; F2: Redis→CH flusher |
| **Durum (2026-07-23)** | **Mitigated** — CH veri var, stream+flusher aktif; parity gate iptal |
| **İlgili dosyalar** | `deploy/clickhouse/config/memory.xml`, `apps/indexer-sol/src/clickhouse.ts` |

---

<a id="f1"></a>
## F1 — Redis weekly XP + clans + sezon

**Plan:** [`guncelleme-master-plan.md` §3](./guncelleme-master-plan.md#3-f1--redis-weekly-xp--clans--sezon)

### Checklist

- [x] `db/migrations/054_clans.sql`
- [x] `apps/indexer-sol/src/weekly-xp.ts`
- [x] `GET /api/xp/weekly`
- [x] `GET /api/leaderboard/weekly`
- [x] `scripts/season-rename-cron.ts`
- [x] `packages/pump-xp` shared keys
- [x] Indexer trade → ZINCRBY (handlers.ts)
- [x] `GET/POST /api/clans`
- [x] Missions Tür A → ZINCRBY (social API hook via `syncWeeklyXpAfterMissionAward`)
- [x] UI weekly leaderboard badge (`WeeklyXpBadge` on TradePanel)
- [x] UI weekly leaderboard tab (`WeeklyLeaderboardPanel` — Redis ZREVRANGE)
- [x] VM smoke: trade → `ZSCORE weekly_user_xp {trader}` — 4784 @ FSsut6… (2026-07-24)
- [x] VM smoke: `ZREVRANGE weekly_user_xp 0 9` = `/api/leaderboard/weekly?limit=10` (8 rows)
- [x] `bootstrap-season-redis.sh` — season:current id=1 (2026-07-23T19:58:50Z)

### LOG

#### 2026-07-24 ~00:30 — F1 VM smoke yeşil

- **Host:** instance-20260713-123055
- **Redis:** `ZREVRANGE weekly_user_xp 0 9` → 8 trader (top 9910 XP)
- **API:** `/api/xp/weekly?address=FSsut6…` → 4784, cashbackEligible
- **API:** `/api/leaderboard/weekly?limit=10` → 8 users, season id=1
- **Ops:** `bootstrap-season-redis.sh` OK (season:current created)
- **Fix deployed:** weekly-xp Redis connect mutex (leaderboard empty bug)
- **Sonraki:** F3 program fee v2 devnet

#### 2026-07-24 ~00:10 — F1 missions hook + weekly UI (local)

- **Dosyalar:**
  - `apps/web/src/lib/redis/weekly-xp.ts` — `awardWeeklyXpMission`, `syncWeeklyXpAfterMissionAward`
  - `apps/web/src/lib/db/incentive.ts` — mission/referral award → Redis ZINCRBY
  - `WeeklyXpBadge`, `WeeklyLeaderboardPanel`, `useWeeklyXp`
  - `TradePanel` toolbar badge; missions leaderboard tab → Redis weekly
- **Sonraki:** VM smoke (trade + admin-link mission + ZSCORE trader wallet)

#### 2026-07-23 ~19:00 — F1 Redis XP VM kısmen aktif

- **Commit:** `c32a2b4`
- **Redis:** `ZCARD weekly_user_xp=3` · `USE_REDIS_WEEKLY_XP=true`
- **Sonraki:** trader cüzdan ile ZSCORE doğrula; `/api/leaderboard/weekly`; `bootstrap-season-redis.sh` (season:current hâlâ nil ise)

#### 2026-07-23 ~04:10 — F1 VM smoke (bekliyor)

- **Migration 054:** OK (deploy)
- **Env:** indexer `REDIS_URL` OK; web `USE_REDIS_WEEKLY_XP` — trailing space düzeltilmeli
- **Smoke hatası:** `ZSCORE` token mint ile sorgulandı (trader cüzdan değil) → `(nil)` beklenen
- **season:current:** `(nil)` — opsiyonel: `bash deploy/vm/bootstrap-season-redis.sh`
- **Sonraki:** küçük trade + trader cüzdan ile ZSCORE; `curl -i /api/leaderboard/weekly`

#### 2026-07-23 — F1 core (local)

- **Dosyalar:** `054_clans.sql`, `weekly-xp.ts`, API routes, `@pump/xp`
- **Env:** `USE_REDIS_WEEKLY_XP=true` + `REDIS_URL` gerekli
- **Doğrulama:** `npm run typecheck` web + indexer-sol OK
- **Sonraki:** migration apply VM, missions hook, UI

---

<a id="f2"></a>
## F2 — CH stabilize + Redis→CH flusher

**Plan:** [`guncelleme-master-plan.md` §4](./guncelleme-master-plan.md#4-f2--ch-stabilize--redisch-flusher)

### Checklist

- [x] `apps/ch-flusher/` worker
- [x] Redis streams `pump:ch:trades`, `pump:ch:candles`
- [x] Indexer XADD (`redis-ch-stream.ts`, flag `CLICKHOUSE_VIA_REDIS_STREAM=true`)
- [ ] CH async_insert user config VM
- [x] Flusher PM2 `pump-ch-flusher` online (VM)
- [x] `CLICKHOUSE_VIA_REDIS_STREAM=true` indexer-sol (VM)
- [x] ~~7d parity gate~~ — iptal

### LOG

#### 2026-07-23 ~19:00 — F2 stream cutover VM

- **Commit:** `c32a2b4`
- **Env:** `apps/indexer-sol/.env` → `CLICKHOUSE_VIA_REDIS_STREAM=true`
- **Metrikler:** `XLEN pump:ch:trades=23` · flusher PM2 online
- **PM2 restart:** pump-ch-flusher, pump-tma, pump-realtime, pump-price-worker
- **Sonraki:** flusher lag izle; CH row count trade ile artmalı

#### 2026-07-23 ~04:00 — F2 flusher VM

- **PM2:** `pump-ch-flusher` online (manuel build + startOrRestart)
- **Stream flag:** kapalı — F0 `compared_ch>0` sonrası açılacak
- **Sonraki:** F0 green → indexer env `CLICKHOUSE_VIA_REDIS_STREAM=true` → `XLEN pump:ch:trades`

#### 2026-07-23 — F2 worker + indexer stream path

- **apps/ch-flusher:** `async_insert=1, wait_for_async_insert=1`
- **Indexer:** `CLICKHOUSE_VIA_REDIS_STREAM=true` ile direct CH HTTP kapatılır
- **Sonraki:** VM'de flusher PM2 + flag aç

### Araştırma notları

- ClickHouse async insert: https://clickhouse.com/docs/optimize/asynchronous-inserts  
- **Prod:** `wait_for_async_insert=1` (guncelleme2’deki `wait=0` kullanılmayacak — silent data loss riski)

---

<a id="f3"></a>
## F3 — Program fee v2 + cashback

**Plan:** [`guncelleme-master-plan.md` §5](./guncelleme-master-plan.md#5-f3--on-chain-program-fee-v2--cashback)

### Checklist

- [x] `docs/fee-split-v2-spec.md` finalized
- [x] Program: user_xp arg, 6-way split, cashback PDA, season/clan accrual PDAs
- [x] SDK rebuild (`encodeBuyIx`/`encodeSellIx` 21-byte + PDA seeds)
- [x] TradePanel pre-trade XP (`silent-trade` → `/api/xp/weekly`)
- [x] Indexer: `FeeSplitV2Event` decode + audit log
- [x] Devnet deploy + tests (program upgrade slot 478398440)

### LOG

| Tarih | Not |
|-------|-----|
| 2026-07-24 | F3 kod: program 6-way `accrue_fees`, 17-account buy/sell, `FeeSplitV2Event`, SDK/web/indexer wiring |
| 2026-07-24 | **Devnet deploy** sig `3U54buGN…` · ProgramData 74160 bytes · authority `7yqf5m5P…` |
| 2026-07-24 | **Sonraki:** `main` push → CI/CD (`deploy/tma-deploy.sh`) veya VM `./deploy/tma-deploy.sh` |

---

<a id="f4"></a>
## F4 — Sezon settlement + havuz claim

**Plan:** [`guncelleme-master-plan.md` §6](./guncelleme-master-plan.md#6-f4--sezon-settlement--haftalık-havuz-claim)

### Checklist

- [x] `apps/settlement-worker/` — allocation math + PG audit
- [x] Top100 + top3 clan math (`@pump/xp/settlement`)
- [x] Chunked on-chain writes (`credit_season_reward` IX 12 + worker `--credit-on-chain`)
- [x] claims_open flag + UI claim CTA
- [x] `season_settlement_runs` audit table (used by worker)

### LOG

| Tarih | Not |
|-------|-----|
| 2026-07-24 | F4a: `allocatePoolByXp` / `allocateClanSeasonPool`, worker reads season/clan PDA balances, claims banner on leaderboard |
| 2026-07-24 | F4b: IX 12/13 credit+claim season, settlement `--credit-on-chain`, `/api/season/rewards`, leaderboard claim |
| 2026-07-24 | **Deploy:** program redeploy (F4b) + `main` push veya VM `./deploy/tma-deploy.sh` |

---

<a id="f5"></a>
## F5 — Go indexer + LaserStream gRPC

**Plan:** [`guncelleme-master-plan.md` §7](./guncelleme-master-plan.md#7-f5--go-indexer--laserstream-grpc-ts-rewrite)

### Checklist

- [x] `apps/indexer-sol-go/` scaffold + decode port
- [x] Devnet RPC poll ingest (F5a — superseded)
- [x] **Helius LaserStream gRPC only** (F5b — VM decode smoke ✅)
- [x] **F5c primary writes** (PG SSOT + Redis PUBSUB/XADD + CH stream) — kod hazır; VM smoke bekliyor
- [ ] F5d TS indexer retire (F6)
- [x] systemd `pump-indexer-sol-go.service` + `build-indexer-sol-go.sh`

### LOG

| Tarih | Not |
|-------|-----|
| 2026-07-24 | F5b: `helius-laserstream-sdk/go` — tek tx filter; RPC poll/WS kaldırıldı |
| 2026-07-24 | **VM F5b smoke:** TradeEvent + FeeSplitV2 decode slot=478411886; TS indexer disabled |
| 2026-07-24 | **F5c coded:** `handlers` trade PG TX + `publishTrade` PUBSUB/XADD + CH stream + weekly XP + live candles L1/Redis |
| 2026-07-24 | **Targeted CI/CD:** `deploy-targeted.sh` + `gh-classify-targets.sh` — indexer/ui/db/realtime/ch ayrı slice |
| 2026-07-24 | **CI/CD fix v2:** `full` fallback kaldırıldı; admin web'den ayrı (nginx static, pm2 yok); pm2 çoklu `--only`; Go PATH `/usr/local/go/bin`; deploy/** → `sync_only` (~10s) |
| 2026-07-24 | **Reconcile slice:** her deploy sonu `deploy-reconcile-services.sh` — down indexer/pm2/health otomatik heal |

### F5c — Write path (100k kullanıcı / VM hedefi)

**Prensip:** Hot path = Redis (PUBSUB + hot cache + seq); durable = CH via `pump:ch:*` stream + flusher; PG = positions/trades/bonding SSOT only. WS fan-out `apps/realtime` — indexer Redis’e yazar, kullanıcı başına RPC yok.

| Alt | Deliverable | Durum |
|-----|-------------|--------|
| F5c.1 | Config + PG pool + trade TX (trades, bonding, positions, volumes) | 🟢 |
| F5c.2 | Live candles L1+Redis → `publishTrade` PUBSUB + replay streams | 🟢 |
| F5c.3 | CH stream XADD (`pump:ch:trades`, `pump:ch:candles`) + weekly XP ZINCRBY | 🟢 |
| F5c.4 | TokenCreated + board stats + missions + wallet PUBLISH | ⬜ |
| F5c.5 | Slot cursor + load smoke + rollback runbook | ⬜ |

**VM SLO (devnet → mainnet):** indexer CPU < TS baseline · WS p95 ≤ baseline · `XLEN pump:ch:*` lag < 5s · PG insert rate = trade rate

### Araştırma notları

| Kaynak | URL |
|--------|-----|
| LaserStream overview | https://www.helius.dev/docs/laserstream |
| gRPC quickstart | https://www.helius.dev/docs/laserstream/grpc |
| Go/Rust/TS SDK | https://github.com/helius-labs/laserstream-sdk |
| Devnet endpoint | `https://laserstream-devnet-ewr.helius-rpc.com` |
| Self-hosted alt | https://github.com/rpcpool/yellowstone-grpc |

**Env (devnet draft):**

```bash
SOLANA_GEYSER_ENDPOINT=https://laserstream-devnet-ewr.helius-rpc.com
SOLANA_GEYSER_API_KEY=<HELIUS_API_KEY>
SOLANA_GEYSER_PROGRAM_IDS=Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus
```

### Cutover fazları (F5 alt)

| Alt | Durum | Not |
|-----|--------|-----|
| 5b LaserStream gRPC | 🟢 | VM: Trade+FeeSplitV2 decode |
| 5c primary writes | 🟢 coded | VM smoke: GO_SHADOW_MODE=primary |
| 5d TS stop | 🟢 | VM: pump-indexer-sol disabled |

---

<a id="f6"></a>
## F6 — PG offload + TS indexer emekli

**Plan:** [`guncelleme-master-plan.md` §8](./guncelleme-master-plan.md#8-f6--pg-yük-offload--ts-indexer-emekli)

### Checklist

- [x] SKIP_PG_TOKEN_CANDLES=true (web + indexer-sol VM)
- [ ] Weekly XP off PG
- [x] TS EVM indexer disabled + legacy dir arşivlendi
- [ ] Go indexer enabled
- [ ] deploy scripts updated
- [ ] Rollback tested

### LOG

#### 2026-07-23 ~19:00 — F6 PG candle mirror OFF + Solana-only temizlik

- **Commit:** `c32a2b4`
- **Env:**
  - web `.env`: `SKIP_PG_TOKEN_CANDLES=true` · 7 EVM key silindi (`APPLY=1 solana-only-audit --cleanup-evm-env`)
  - indexer-sol: `SKIP_PG_TOKEN_CANDLES=true`
- **Servisler:**
  - `systemctl stop+disable pump-indexer pump-airdrop-keeper`
  - `mv /var/www/pump/Indexer → Indexer.evm-archived.20260723`
  - `ensure-solana-env.sh` · pm2 restart tma/realtime/flusher/price-worker
- **Doğrulama:** `solana-only-audit.sh` → web/indexer-sol EVM keys=0 · `system-health overall=healthy`
- **Rollback:** `SKIP_PG_TOKEN_CANDLES=false` + indexer restart (PG mirror geri)

#### 2026-07-23 ~19:00 — Solana-only audit araçları (repo)

- **Dosyalar:** `deploy/vm/solana-only-audit.sh`, `deploy/vm/local-audit.ps1`, `deploy/vm/guncelleme-phase-status.sh`
- **Script fix:** `SKIP_ALTO_BUNDLER` artık EVM sayılmıyor

---

<a id="f7"></a>
## F7 — Jupiter price + portfolio CH tab

**Plan:** [`guncelleme-master-plan.md` §9](./guncelleme-master-plan.md#9-f7--jupiter-price-worker--portfolio-ch-tab)

### Checklist

- [x] Price worker → Redis `price:native:sol:usd` (VM ~77.99 CoinGecko)
- [ ] `/api/price/native` Redis read doğrulama
- [ ] Portfolio trade history from CH
- [ ] Binance/CG fallback preserved

### LOG

#### 2026-07-23 ~04:05 — F7 price worker VM

- **Redis:** `GET price:native:sol:usd` → SOL ~77.99, source=coingecko
- **PM2:** `pump-price-worker` online
- **Sonraki:** `/api/price/native` curl; portfolio CH tab F2/F0 sonrası

#### _(önceki)_

---

<a id="f8"></a>
## F8 — Prod hardening

### Weekly ritual log

| Hafta | chart-parity | PG CPU | WS p95 | CH flusher lag | Not |
|-------|--------------|--------|--------|----------------|-----|
| 2026-W30 | gate iptal | — | healthy (smoke) | stream ON · XLEN=23 | Solana-only VM; F0/F2/F6/F7 green |

---

## Env flag evrimi (tüm fazlar)

| Flag | F0 | F1 | F2 | F6 | Açıklama |
|------|----|----|----|-----|----------|
| `USE_CLICKHOUSE_CANDLES` | true | true | true | true | Web chart read |
| `CLICKHOUSE_DUAL_WRITE` | true | true | false→stream | false | F2’de indexer direct write kapat |
| `SKIP_PG_TOKEN_CANDLES` | false | false | false | **true** | operatör cutover (parity gate iptal) |
| `USE_REDIS_WEEKLY_XP` | — | **true** | true | true | F1 feature flag |
| `SOLANA_INDEXER_SOURCE` | rpc | rpc | rpc | **geyser** | F5 cutover |
| `INDEXER_IMPL` | ts | ts | ts | **go** | F6 |

---

## Commit / PR referansları

| Faz | Branch / PR | Commit | Tarih |
|-----|-------------|--------|-------|
| F0–F2,F6 | main | `c32a2b4` | 2026-07-23 |
| F7 | main | `c32a2b4` | 2026-07-23 |

---

## Log yazım şablonu (kopyala-yapıştır)

```markdown
#### YYYY-MM-DD HH:MM — F{N} {başlık}
- **Commit:** `abc1234` (branch: `feat/f{n}-...`)
- **Yapan:** @name
- **Değişen dosyalar:** (kısa liste)
- **Env (VM):**
  - `/var/www/pump/tma/.env`: KEY=value
  - `apps/indexer-sol/.env`: KEY=value
- **Komutlar:**
  ```bash
  # ...
  ```
- **Metrikler / doğrulama:**
  - ...
- **Kararlar:** (neden X seçildi, Y reddedildi)
- **Sorunlar:** (varsa → INC-00X)
- **Sonraki:** F{N+1} veya rollback adımı
```

---

## INCIDENT şablonu

```markdown
#### INC-00X — {kısa başlık} (YYYY-MM-DD)
| Alan | Detay |
|------|--------|
| **Faz** | F{N} |
| **Belirti** | |
| **Kök neden** | |
| **Etki** | |
| **Fix** | commit / env / runbook |
| **Önleme** | monitoring / test eklendi |
```

---

*Son güncelleme: 2026-07-23 ~19:00 — VM Solana-only cutover; F0/F2/F6/F7 prod; legacy Indexer arşiv; system-health healthy*
