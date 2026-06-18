# Pump Ultra-Fast Strategy — Haziran 2026

Resmi strateji dokümanı. Slogan sözleşmesi, sektör karşılaştırması, mevcut mimari denetimi ve uygulama yol haritası.

**Slogan**

| Vaat | Teknik anlamı | Hedef metrik |
|------|---------------|--------------|
| **0 ms hissi** | SSR/PPR ilk paint; canlı güncelleme WS delta; chip/filter flash yok | FCP < 200ms, WS→UI P95 < 50ms |
| **99.9% doğruluk** | Spot / Quote / Fill ayrımı her yüzeyde | Quote-fill sapması ≤ slippage + 50 bps (P99) |
| **Şeffaflık** | Mark = spot, tape = fill, panel = Est. quote | Kullanıcı sürpriz görmez |

---

## 1. Mevcut mimari (denetim özeti)

### Stack

| Katman | Teknoloji |
|--------|-----------|
| UI | Next.js 16.1, React 19, Tailwind 3, lightweight-charts 5 |
| Web3 | wagmi 2, viem 2, Reown AppKit |
| DB | PostgreSQL 16 (`pg` pool) |
| Cache | Redis (arena 2s TTL), API in-memory Map |
| Realtime | `pump-realtime` (ws + Redis Pub/Sub) |
| Indexer | Node ESM, BSC RPC poll, incremental `token_board_stats` |
| Deploy | Tek VM, PM2 (`pump-tma` + `pump-realtime`) |

### Veri akışı

```
BSC events → Indexer → PostgreSQL (OLTP + token_board_stats + MVs)
                    → Redis PUBLISH + cache invalidation
                    → Next.js SSR/API
Redis Pub/Sub → pump-realtime → Browser WS rooms → delta patches
```

### Güçlü yanlar

- Arena + token + airdrops SSR
- WS delta: arena, token, portfolio (`*-live-delta.ts`)
- Fiyat semantiği: spot / quote / fill (`price-accuracy-contract.md`)
- Incremental board stats (migration 011)
- Arena chip filter cache + skeleton (flash fix)
- User bootstrap (4→1 API)

### Kritik eksikler (post-Tier 4)

| Eksik | Etki |
|-------|------|
| Full Rocicorp Zero sync | Cross-device favorites instant |
| Edge WS terminator | Global < 50ms WS |
| pg_trickle on PG 18 | MV CPU −80% |

### Tier 3 tamamlananlar ✅

| Yetenek | Durum |
|---------|-------|
| Read replica routing | ✅ `pool.ts` + arena SELECT path |
| PgBouncer-ready pools | ✅ `PGBOUNCER_ENABLED` + low `PG_POOL_MAX` |
| PM2 cluster 2×2 | ✅ Next + realtime |
| Indexer `watchBlocks` | ✅ opt-in WS newHeads |
| Enriched WS (`volume24h`, `traders24h`) | ✅ indexer → arena delta |
| TanStack Query arena board | ✅ `fetchQuery` + hooks |

### Tier 2 tamamlananlar ✅

| Yetenek | Durum |
|---------|-------|
| Token bundle SSR (chart + holders) | ✅ PPR island |
| WS seq + Redis Streams replay | ✅ indexer XADD + realtime XREVRANGE |
| rAF patch coalescing | ✅ arena + token |
| Per-token Redis snapshot | ✅ 5s TTL |
| `price_accuracy_violation` telemetry | ✅ TradePanel receipt hook |
| Token Suspense fallback | ✅ AppShell + skeleton |

---

## 2. Sektör karşılaştırması (2026)

### DexScreener

- Özel indexer, ham zincir logları, harici API yok ([docs](https://docs.dexscreener.com/))
- Redis hot snapshot + WS push
- REST = cache miss / backfill

**Pump uyumu:** Aynı lane (indexer → PG → Redis → WS). Eksik: agresif edge cache, horizontal WS scale.

### Hyperliquid

- On-chain CLOB, sub-second finality (~200ms median)
- WS: snapshot + incremental delta + sequence
- Reconnect: fresh snapshot, local book reconstruct ([docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/optimizing-latency))

**Pump dersi:** Bonding curve state için snapshot+seq+replay pattern uygulanabilir.

### Hyperopen (açık kaynak client)

- Reducer + projection layer; UI ham payload görmez
- WS runtime: lossy buffer (market) vs lossless (fills)
- Normalize once at edge

**Pump dersi:** `ArenaListClient` trade burst'te doğrudan setState → rAF coalescing + view model.

### Pump.fun ekosistemi (Solana)

- Yellowstone gRPC / Geyser push ingestion
- PG sink, batch flush tuning (live 5 block / catch-up 200 block)
- In-memory token set + Socket.IO fan-out

**Pump dersi:** BSC'de `eth_subscribe` veya dedicated node ile poll latency düşürülebilir.

### Rocicorp Zero 1.0 (2026)

- Postgres → client normalized store; query-driven partial sync
- Reads/writes anında local; background reconcile ([zero.rocicorp.dev](https://zero.rocicorp.dev/))

**Pump dersi:** Favorites / watchlist / portfolio read path için radikal 0ms (Tier 4).

### Next.js 16 Cache Components

- `cacheComponents: true` + `'use cache'` + `cacheLife`
- PPR: static shell + cached sections stream ([docs](https://nextjs.org/docs/app/getting-started/caching))

**Pump dersi:** Arena board snapshot shell'e gömülür; WS sadece delta.

---

## 3. Karşılaştırma matrisi

| Yetenek | DexScreener | Hyperliquid | Pump TMA (bugün) | Hedef |
|---------|-------------|-------------|------------------|-------|
| Ingestion | Custom indexer | L1 native | RPC poll | eth_subscribe |
| Read path | Redis + replica | Local node | PG + Redis 2s | + per-token snapshot |
| WS model | Push | Snapshot+delta | Pub/Sub + replay | + enriched payload |
| UI update | Throttled | Projection | rAF batch | view model |
| İlk paint | Cached shell | App | PPR + cache ✅ | — |
| Fiyat | Pair price | Mark/Last | Spot/Quote/Fill ✅ | + violation metrics |

---

## 4. Uygulama fazları

### Tier 1 — Hemen (1–3 hafta) ✅ tamamlandı

| # | İş | Dosyalar | Durum |
|---|-----|----------|-------|
| 1 | `cacheComponents: true` | `next.config.ts` | ✅ |
| 2 | Arena `use cache` + `cacheTag('arena')` | `src/lib/arena-server.ts` | ✅ |
| 3 | Portfolio SSR + wallet cookie | `portfolio/page.tsx`, `PortfolioPageLoader.tsx` | ✅ |
| 4 | `fetchPortfolioPayload` cached | `src/lib/portfolio-server.ts` | ✅ |
| 5 | PPR Suspense islands | `ArenaHomeServer.tsx`, `RootProviders.tsx`, `layout.tsx` | ✅ |
| 6 | `connection()` dynamic markers | `ArenaHomeServer`, `PortfolioPageLoader` | ✅ |

### Tier 2 — Orta vade (1–2 ay) ✅ tamamlandı

| # | İş | Durum |
|---|-----|-------|
| 5 | Token bundle SSR (chart + holders) | ✅ |
| 6 | WS seq + Redis Streams replay | ✅ |
| 7 | rAF patch coalescing (arena/token) | ✅ |
| 8 | Per-token Redis snapshot | ✅ |
| 9 | Enriched WS trade payload | ✅ volume24h + traders24h |
| 10 | `price_accuracy_violation` metrics | ✅ |
| 11 | TanStack Query standard (keepPreviousData) | ✅ |

### Tier 3 — Ölçek (2–4 ay) ✅ kod hazır (VM deploy gerekir)

| # | İş | Durum |
|---|-----|-------|
| 11 | TanStack Query (`keepPreviousData` + arena cache) | ✅ |
| 12 | PgBouncer transaction mode | ✅ snippet + phase-5 script |
| 13 | PG tuning + partial index audit | ✅ `012_tier3_scale_indexes.sql` |
| 14 | PM2: 2× realtime + 2× Next | ✅ `ecosystem.config.cjs` cluster |
| 15 | Read replica (arena read-only) | ✅ `LAUNCHPAD_DATABASE_READ_URL` |
| 16 | Indexer: `watchBlocks` (eth_subscribe heads) | ✅ `INDEXER_USE_WS_BLOCKS` |

### Tier 4 — Cesur yenilikler ✅ (kod — infra kısmi)

| # | İş | Durum |
|---|-----|-------|
| 17 | Rocicorp Zero (favorites/portfolio reads) | ⏳ local-first store (Zero path doc) |
| 18 | Edge WS (Durable Objects) | ⏳ eval doc — tek VM yeterli |
| 19 | Client bonding curve state machine | ✅ `bonding-curve-state` + hook |
| 20 | PostgreSQL 18 + pg_trickle IVM | ⏳ eval doc — PG 16 VM |

### Tier 4 tamamlananlar ✅

| Yetenek | Durum |
|---------|-------|
| Local-first favorites hydrate | ✅ `user-local-store` |
| Local-first portfolio hydrate | ✅ `PortfolioPanel` |
| WS-driven curve quotes (0ms Est.) | ✅ `useBondingCurveMachine` |
| Zero / Edge / pg_trickle yol haritası | ✅ `.cursor/docs/tier4-*.md` |

---

## 5. Bilinçli olarak YAPILMAYACAKLAR (tek VM)

- Kafka cluster — ops + latency; Redis Streams yeterli
- ClickHouse / TimescaleDB — erken
- RisingWave / Materialize — VM RAM
- Client-only sayfalar — slogan ile çelişir
- Her trade'de full MV refresh
- shadcn/MUI geçişi

---

## 6. Başarı metrikleri

```text
arena_ssr_ttfb_ms          P95 < 150
arena_ws_patch_latency_ms  P95 < 50
api_tokens_p95_ms          < 80 (cache hit < 10)
portfolio_ssr_ttfb_ms      P95 < 150
quote_fill_deviation_bps   P99 < SLIPPAGE_BPS + 50
board_mcap_ws_api_drift    < 0.1%
```

---

## 7. Ortam checklist (prod)

```env
USE_TOKEN_BOARD_STATS=true
USE_REDIS_ARENA_CACHE=true
INCREMENTAL_BOARD_STATS=true
REDIS_PUBLISH_ENABLED=true
NEXT_PUBLIC_WS_ENABLED=true
```

Next.js (Tier 1+):

```env
# cacheComponents enabled in next.config.ts — no extra env
```

---

## 8. İlgili dokümanlar

| Doküman | İçerik |
|---------|--------|
| `tier4-local-first-zero-path.md` | Local-first + Zero migration |
| `tier4-edge-ws-evaluation.md` | Edge WS when to split |
| `tier4-pg-trickle-evaluation.md` | PG 18 IVM plan |
| `ultra-fast-architecture-phases-2-6.md` | Detaylı faz planı |
| `price-accuracy-contract.md` | Spot / Quote / Fill sözleşmesi |
| Bu dosya | Strateji + sektör karşılaştırma + tier öncelik |

---

*Son güncelleme: Haziran 2026. Kaynaklar: DexScreener docs, Hyperliquid docs, Hyperopen, Rocicorp Zero 1.0, Next.js 16 Cache Components, DEV blockchain indexer guide.*
