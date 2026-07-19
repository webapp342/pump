# Solana port

Parallel Solana launchpad path beside the existing Base/EVM stack. Production stays on EVM until Solana is feature-complete and flagged on.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Strategy | Scaffold Solana **alongside** EVM; do not delete Base |
| Curve | Permanent bonding curve (**no** graduation / PumpSwap migrate) |
| Wallet (Phase 2) | **Self-hosted (EVM parity)** — same Telegram/Google/Apple OIDC; server-held encrypted Ed25519 keypair; **no Privy / Turnkey / paid wallet SaaS** |
| Tx fees | **User pays** SOL network fees (`feePayer` = user). No Pump-sponsored gas. Curve protocol/creator/referrer **trading** fees unchanged. |
| Indexer (Phase 3) | Helius LaserStream *or* self-hosted Yellowstone when ready; Redis → `apps/realtime` |
| Network | Devnet first; program IDs via env |

## Layout

| Path | Role |
|------|------|
| `programs/pump-launchpad/` | **Primary** — Pinocchio single program (~0.21 SOL rent) |
| `programs/pump-curve/` | Deprecated Anchor reference (do not deploy) |
| `programs/scripts/initialize-pinocchio.ts` | Post-deploy `initialize` with `PUMP_FEEL_DEFAULTS` |
| `scripts/solana/` | `wsl-pinocchio-build.sh` / `wsl-pinocchio-deploy.sh` |
| `packages/solana-sdk` | `@pump/solana-sdk` — program ID, ix encoders, feel defaults |
| `apps/indexer-sol` | Solana log indexer (RPC `onLogs` now; LaserStream stub) |
| `apps/web/src/config/chain-family.ts` | `NEXT_PUBLIC_CHAIN_FAMILY` (`evm` \| `solana`), default **`evm`** |
| `contracts/` | Unchanged Foundry EVM contracts |

## Phases

| Phase | Status | Scope |
|-------|--------|--------|
| **0–1** | Done | Docs, Anchor stubs, `@pump/solana-sdk`, chain-family flag |
| **1b** | Done | Pinocchio program deployed devnet + initialize |
| **2** | Done | Wallet API, silent trade, deposit/withdraw, CI Solana env |
| **3** | In progress | `indexer-sol` deploy on VM; board/trades decode TBD |
| **4** | In progress | TradePanel Solana path; create token UI next |
| **5** | Planned | Airdrop + KOL escrow programs + admin |
| **6** | Planned | Audit + mainnet |

## Toolchain (local)

**Windows:** Solana program builds require **WSL2 Ubuntu**.

| Tool | Where | Version |
|------|--------|---------|
| Solana CLI | WSL | **4.1.1** (`stable`) + platform-tools **v1.54** (rustc 1.89) |
| Anchor CLI | WSL avm | **0.31.1** |
| Go (Windows host) | system | 1.25+ |
| Docker | Desktop | ClickHouse / Geyser later |

Scripts:

```bash
bash /mnt/c/Users/DARK/Desktop/pump-tma/scripts/solana/wsl-solana-stable.sh
bash /mnt/c/Users/DARK/Desktop/pump-tma/scripts/solana/wsl-upgrade-anchor-031.sh
bash /mnt/c/Users/DARK/Desktop/pump-tma/scripts/solana/wsl-anchor-build.sh
```

`anchor build` **succeeds** (artifacts under `programs/target/deploy/*.so` + `target/idl/*.json`). Next: `anchor deploy` + `initialize` on devnet.

Remaining architecture (Yellowstone / Go / ClickHouse / silent sign): [`docs/solana-stack-plan.md`](solana-stack-plan.md).

### Phase 1b on-chain behavior

- **Math:** `programs/pump-curve/src/math.rs` — same CP quotes as EVM `quoteBuy` / `quoteSell`.
- **Buy/sell:** SOL into curve account; SPL from/to curve token vault; protocol fee → treasury; creator/referrer shares paid immediately.
- **Factory:** mint SPL → vault ATA → CPI `register_curve` (factory-signer PDA).
- **Treasury:** `withdraw` from vault PDA.
- **Not yet:** Metaplex metadata, initial buy in `create_meme`, verified-KOL BPS, Anchor integration tests on validator.

## Program map (EVM → Solana)

| EVM (`contracts/src/`) | Solana (`programs/`) |
|------------------------|----------------------|
| `MemeFactory.sol` | `pump-factory` |
| `BondingCurveManager.sol` | `pump-curve` |
| `LaunchpadTreasury.sol` | `pump-treasury` |

PDA seeds (see `@pump/solana-sdk`):

- Global config: `["global"]`
- Curve: `["curve", mint]`

## Wallet model (Phase 2 — same idea as EVM)

EVM today: OIDC login → encrypted EOA in DB → client builds ZeroDev Kernel session and signs UserOps.

Solana target (no paid custody SaaS):

1. **Same login** — existing Telegram / Google / Apple OIDC + session cookie.
2. **Key** — on first Solana enable, derive/store an **Ed25519** keypair encrypted with `WALLET_ENCRYPTION_SECRET` (mirror `telegram_wallets` / `oauth_wallets`).
3. **Sign** — client signs Solana transactions with that key — **no** ERC-4337 / Kernel / Alto.
4. **Fees** — user is `feePayer` and must hold a little SOL for network fees. Trading fees (protocol/creator/referrer) still come from the bonding-curve trade, same as EVM.

```text
OIDC subject
  → encrypted Ed25519 secret (Postgres `solana_wallets`)
  → pubkey = user trading address
  → tx: user signs + pays lamports for network fee
```

### Phase 2 status (wallet + pump.fun feel)

| Piece | Status |
|-------|--------|
| Migration `044_solana_wallets.sql` | Done |
| Encrypt/decrypt secret bytes | Done (`wallet-key-crypto`) |
| `POST/GET /api/auth/solana/wallet` | Done |
| Client `ensureSolanaWalletClient` | Done |
| `PUMP_FEEL_DEFAULTS` (0 create fee, ~30 SOL virtual, 1B @ 6dp, 1% trade fee) | Done in `@pump/solana-sdk` |
| Deposit/withdraw UI | Done (`SolanaDepositView` / `SolanaWithdrawForm`, gated by `CHAIN_FAMILY=solana`) |
| Silent in-memory session + popup-free buy/sell | Done (`silent-session`, `silent-trade`, TradePanel branch) |
| Deploy checklist + feel args | Done (`npm run solana:deploy-init`, `programs/scripts/initialize.ts`) |
| On-chain `anchor deploy` + initialize | Blocked on local Solana/Anchor CLI |

### Phase 3 status (indexer)

| Piece | Status |
|-------|--------|
| `apps/indexer-sol` package | Done |
| Event name → handler map (`@pump/solana-sdk` events) | Done |
| Anchor discriminator + borsh decode | Done (`decode.ts`) |
| PG writes: TokenCreated / TokenRegistered / Trade / FeeSplit | Done (same tables as EVM; `*_zug` columns hold SOL) |
| Positions cost basis (simplified) | Done |
| RPC `Connection.onLogs` source | Done (dev default) |
| Helius LaserStream / Yellowstone | Stub (`SOLANA_INDEXER_SOURCE=laserstream`) |
| Redis publish / candle / board rollups | Next |
| Decode self-test | `npm run test:decode -w @pump/indexer-sol` |

`tokens.chain_id` for Solana uses synthetic IDs (`SOLANA_DB_CHAIN_ID`: localnet `901100`, mainnet `901101`, devnet `901103`) so rows never collide with Base. Override with `SOLANA_CHAIN_ID`.

```bash
# print feel defaults + toolchain check
npm run solana:deploy-init

# decode smoke test (no DB)
npm run test:decode -w @pump/indexer-sol

# indexer (needs LAUNCHPAD_DATABASE_URL)
npm run indexer:sol:dev
```

## Safety

- **Production cutover:** `deploy/tma-deploy.sh` runs `ensure-solana-env.sh` → `NEXT_PUBLIC_CHAIN_FAMILY=solana` before every build.
- EVM (Base Sepolia) code remains in repo; set `NEXT_PUBLIC_CHAIN_FAMILY=evm` locally to test legacy path.
- No third-party wallet SaaS (Privy/Turnkey) in the target path.
- Migration `044_solana_wallets.sql` applied idempotently on full deploy.
- Solana indexer: `deploy/vm/indexer-sol-deploy.sh` + `deploy/pump-indexer-sol.service`.
