# Solana target stack — remaining plan

After local toolchain install (WSL: Solana CLI + Anchor). What is left to reach the full free/open stack.

## Already in place (do not rebuild)

| Layer | Status |
|-------|--------|
| PostgreSQL | Prod + migrations; `solana_wallets` AES encryption; **positions SoT** |
| Self-hosted Ed25519 wallet | API + deposit/withdraw UI |
| Pinocchio / Anchor programs | `programs/pump-launchpad` (feel parity) |
| Redis + WS | `apps/realtime` shared with Solana publish |
| Go | Host `go1.25` — Yellowstone consumer later |
| Docker ClickHouse | Compose + schema scaffold; dual-write **off** |
| Node indexer-sol | Decode + PG writes + USD cost basis + optional CH HTTP insert |

## Install gate (local / WSL) — status 2026-07-19

| Tool | Status |
|------|--------|
| WSL2 Ubuntu | Present |
| Solana CLI | **4.1.1** stable + platform-tools **v1.54** (rustc 1.89) |
| Anchor CLI | **0.31.1** |
| `anchor build` | **OK** — `pump_{factory,curve,treasury}.so` + IDLs |
| Go | Host `go1.25` |
| Docker | Desktop available |
| Next | `anchor deploy` + feel `initialize` on devnet |

```bash
bash /mnt/c/Users/DARK/Desktop/pump-tma/scripts/solana/wsl-anchor-build.sh
cd /mnt/c/Users/DARK/Desktop/pump-tma/programs && anchor deploy
```

## Phased remaining work

### A — Ship on-chain (blocked only by Anchor build)

1. `anchor build` → IDLs under `programs/target/idl/`
2. Deploy + `initialize` with `PUMP_FEEL_DEFAULTS`
3. Sync program IDs into `@pump/solana-sdk` + env
4. Migration `044` on VM Postgres

### B — Ingest (Yellowstone, not paid LaserStream)

1. Self-hosted Agave RPC **or** rent a bare-metal RPC (still self Geyser)
2. Enable [Yellowstone gRPC Geyser plugin](https://github.com/rpcpool/yellowstone-grpc)
3. Replace `apps/indexer-sol` LaserStream stub with gRPC consumer
4. Prefer **Go** consumer (`apps/indexer-sol-go`) for multi-core decode → PG + Redis; keep TS as fallback

### C — Hot path (Redis → WS)

1. Mirror EVM `redis-publish` from Solana trade/token events
2. Reuse `apps/realtime` channels (or `solana:*` prefix)
3. Target: board price + callout push &lt;1ms after Redis write

### D — Analytics (ClickHouse) — scaffold ready, gate closed

**Locked decision (2026-07-20):** Hybrid only.

| Store | Owns |
|-------|------|
| PostgreSQL | wallets, `user_positions` (frozen USD cost basis), favorites, auth, claims |
| Redis + WS | hot board / portfolio deltas |
| ClickHouse (optional) | `trades_raw` + candle MVs for history scale |

1. Compose: [`deploy/clickhouse/docker-compose.yml`](../deploy/clickhouse/docker-compose.yml) (mem_limit 2g)
2. Schema: [`deploy/clickhouse/init/01_schema.sql`](../deploy/clickhouse/init/01_schema.sql)
3. Dual-write: `apps/indexer-sol` → `enqueueTradeClickHouse` when `CLICKHOUSE_DUAL_WRITE=true`
4. Chart API → CH only after gate; live buckets stay Redis/PG

**Do not** move positions into ClickHouse.

### Cost-basis / chart parity (indexer-sol)

- Trade-time SOL/USD via Binance/CoinGecko cache → `trades.native_usd_rate` + `remaining_cost_basis_usd`
- Candles write `close_usd` / `native_usd_rate` (spot OHLC)
- Ops: `npm run backfill-cost-basis|check-position-invariants|check-chart-parity -w @pump/indexer-sol`

### E — Signing (decision fork)

**Current locked model:** client signs; user is `feePayer`; no popup SaaS.

**Optional “Go Sol-Kit” silent sign** (only if product accepts custody model):

1. Session-authenticated `POST /api/solana/sign-and-send`
2. Decrypt key with `WALLET_ENCRYPTION_SECRET` in Go
3. Sign + `sendTransaction` to **own** RPC (no Jito tip required)
4. Audit log every sign; rate limits; never return raw secret to client

Until that decision is re-locked, implement **client-side** create/buy/sell with same encrypted key material the web already fetches.

### F — Product UI (Phase 4)

1. `CHAIN_FAMILY=solana` Arena / trade / portfolio
2. Tx builders against deployed IDLs
3. Direct RPC `sendTransaction` (web or Go)

## Suggested order (next 4 milestones)

| # | Milestone | Outcome |
|---|-----------|---------|
| 1 | Anchor build + deploy + init | Live program IDs on devnet |
| 2 | Solana → Redis → realtime | Live board without CH |
| 3 | Yellowstone Go consumer | Replace `onLogs`; drop paid stream dependency |
| 4 | ClickHouse candles | Historical charts at scale |

Silent backend signing and full Go rewrite of Next APIs are **after** 1–3 unless product explicitly switches custody model.

## Cost note

“Free” stack still costs: VPS/RPC CPU/disk for validator or Yellowstone node, bandwidth, ClickHouse storage. No Privy/Jito/Helius subscription required for the target architecture.
