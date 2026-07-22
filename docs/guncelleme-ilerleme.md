# Güncelleme İlerleme Günlüğü

**Master plan:** [`guncelleme-master-plan.md`](./guncelleme-master-plan.md)  
**Analiz:** [`guncelleme-analiz-ve-plan.md`](./guncelleme-analiz-ve-plan.md)

> Her faz bitince ilgili bölüme **LOG** entry ekle. Sorun olunca **INCIDENT** bloğu aç.  
> Format: tarih UTC+4:30 · commit SHA · env değişiklikleri · komutlar · sonuç · sonraki adım.

---

## Durum özeti (canlı)

| Faz | Ad | Durum | Başlangıç | Bitiş | Not |
|-----|-----|--------|-----------|-------|-----|
| F0 | Spec + CH ops | 🟡 **In progress** | 2026-07-23 | — | memory.xml 0.55 repo'da; VM backfill bekliyor |
| F1 | Redis XP + clans | 🟡 **In progress** | 2026-07-23 | — | migration 054, weekly-xp, API, cron |
| F2 | Redis→CH flusher | 🟡 **In progress** | 2026-07-23 | — | apps/ch-flusher + redis-ch-stream |
| F3 | Program fee v2 | 🟡 **In progress** | 2026-07-23 | — | cashback PDA + user_xp + SDK; 6-way pool TODO |
| F4 | Sezon settlement | 🟡 **In progress** | 2026-07-23 | — | settlement-worker scaffold |
| F5 | Go indexer + LaserStream | 🟡 **In progress** | 2026-07-23 | — | apps/indexer-sol-go scaffold |
| F6 | PG offload + TS cutover | ⬜ Pending | — | — | SKIP_PG flag mevcut, cutover bekliyor |
| F7 | Jupiter + portfolio CH | 🟡 **In progress** | 2026-07-23 | — | price-worker + Redis read |
| F8 | Hardening | ⬜ Ongoing | — | — | |

Durum ikonları: ⬜ Pending · 🟡 In progress · 🟢 Done · 🔴 Blocked · ⏸ Paused

---

## VM baseline snapshot (2026-07-22)

**Kaynak:** prod SSH diagnostik — referans için sakla.

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
- [x] CH memory.xml ≥ 0.55 (repo — VM deploy bekliyor)
- [ ] backfill-clickhouse-candles + trades (VM)
- [ ] check-chart-parity compared_ch > 0 (VM)
- [ ] pm2 logs olap ≠ postgres (VM)

### LOG

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
| **Fix planı** | F0: memory ↑, backfill, parity green; F2: Redis→CH flusher + insert metrics |
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
- [ ] Missions Tür A → ZINCRBY (social API hook)
- [ ] UI weekly leaderboard badge

### LOG

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
- [ ] Flusher systemd service VM
- [ ] 7d parity gate

### LOG

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

- [ ] `docs/fee-split-v2-spec.md` finalized
- [ ] Program: user_xp arg, 6-way split, cashback PDA
- [ ] SDK rebuild
- [ ] TradePanel pre-trade XP
- [ ] Devnet deploy + tests

### LOG

_(boş)_

---

<a id="f4"></a>
## F4 — Sezon settlement + havuz claim

**Plan:** [`guncelleme-master-plan.md` §6](./guncelleme-master-plan.md#6-f4--sezon-settlement--haftalık-havuz-claim)

### Checklist

- [ ] `apps/settlement-worker/`
- [ ] Top100 + top3 clan math
- [ ] Chunked on-chain writes
- [ ] claims_open flag + UI
- [ ] `season_settlement_runs` audit table

### LOG

_(boş)_

---

<a id="f5"></a>
## F5 — Go indexer + LaserStream gRPC

**Plan:** [`guncelleme-master-plan.md` §7](./guncelleme-master-plan.md#7-f5--go-indexer--laserstream-grpc-ts-rewrite)

### Checklist

- [ ] `apps/indexer-sol-go/` scaffold
- [ ] Helius LaserStream devnet connect (read-only phase)
- [ ] Decode parity TS vs Go (1000 tx sample)
- [ ] Shadow Redis writes
- [ ] Primary cutover prep
- [ ] systemd `pump-indexer-sol-go.service`

### LOG

_(boş)_

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
| 5a read-only | ⬜ | decode + metrics only |
| 5b shadow Redis | ⬜ | compare TS 3 gün |
| 5c primary writes | ⬜ | PG+Redis+CH stream |
| 5d TS stop | ⬜ | F6 |

---

<a id="f6"></a>
## F6 — PG offload + TS indexer emekli

**Plan:** [`guncelleme-master-plan.md` §8](./guncelleme-master-plan.md#8-f6--pg-yük-offload--ts-indexer-emekli)

### Checklist

- [ ] SKIP_PG_TOKEN_CANDLES=true (7d green sonrası)
- [ ] Weekly XP off PG
- [ ] TS indexer disabled
- [ ] Go indexer enabled
- [ ] deploy scripts updated
- [ ] Rollback tested

### LOG

_(boş)_

---

<a id="f7"></a>
## F7 — Jupiter price + portfolio CH tab

**Plan:** [`guncelleme-master-plan.md` §9](./guncelleme-master-plan.md#9-f7--jupiter-price-worker--portfolio-ch-tab)

### Checklist

- [ ] Price worker → Redis `price:native:sol:usd`
- [ ] `/api/price/native` Redis read
- [ ] Portfolio trade history from CH
- [ ] Binance/CG fallback preserved

### LOG

_(boş)_

---

<a id="f8"></a>
## F8 — Prod hardening

### Weekly ritual log

| Hafta | chart-parity | PG CPU | WS p95 | CH flusher lag | Not |
|-------|--------------|--------|--------|----------------|-----|
| 2026-W30 | compared_ch=0 | — | — | N/A | F0 blocked |

---

## Env flag evrimi (tüm fazlar)

| Flag | F0 | F1 | F2 | F6 | Açıklama |
|------|----|----|----|-----|----------|
| `USE_CLICKHOUSE_CANDLES` | true | true | true | true | Web chart read |
| `CLICKHOUSE_DUAL_WRITE` | true | true | false→stream | false | F2’de indexer direct write kapat |
| `SKIP_PG_TOKEN_CANDLES` | false | false | false | **true** | 7d parity sonrası |
| `USE_REDIS_WEEKLY_XP` | — | **true** | true | true | F1 feature flag |
| `SOLANA_INDEXER_SOURCE` | rpc | rpc | rpc | **geyser** | F5 cutover |
| `INDEXER_IMPL` | ts | ts | ts | **go** | F6 |

---

## Commit / PR referansları

| Faz | Branch / PR | Commit | Tarih |
|-----|-------------|--------|-------|
| F0 | — | — | — |
| F1 | — | — | — |
| F2 | — | — | — |
| F3 | — | — | — |
| F4 | — | — | — |
| F5 | — | — | — |
| F6 | — | — | — |
| F7 | — | — | — |

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

*Son güncelleme: 2026-07-23 — F0 blocked (VM CH incident INC-001)*
