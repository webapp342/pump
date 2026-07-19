# Solana target stack — remaining plan

After local toolchain install (WSL: Solana CLI + Anchor). What is left to reach the full free/open stack.

## Already in place (do not rebuild)

| Layer | Status |
|-------|--------|
| PostgreSQL | Prod + migrations; `solana_wallets` AES encryption |
| Self-hosted Ed25519 wallet | API + deposit/withdraw UI |
| Anchor programs | `pump-factory` / `pump-curve` / `pump-treasury` (source) |
| Redis + WS | EVM path via `apps/realtime` |
| Go | Installed on host (`go1.25`) — unused for Solana yet |
| Docker | Available for ClickHouse / RPC sidecars |
| Node indexer-sol | Decode + core PG writes (RPC `onLogs`) |

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

### D — Analytics (ClickHouse)

1. Docker Compose: ClickHouse (+ optional Keep)
2. Schema: trades, OHLCV rolls (1s/1m/…)
3. Dual-write from Go indexer: PG (source of truth for wallets/positions) + CH (history/charts)
4. Chart API reads CH; TradingView-style endpoints

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
