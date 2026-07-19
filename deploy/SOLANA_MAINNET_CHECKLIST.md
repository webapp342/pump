# Solana mainnet readiness (Faz 5)

Use after devnet smoke passes and before `SOLANA_CLUSTER=mainnet-beta` cutover.

## Program

- [ ] Build `programs/pump-launchpad` with `cargo-build-sbf`
- [ ] Deploy program to mainnet-beta (new program id or upgrade authority)
- [ ] Run `initialize` with production fee BPS and `30 SOL` virtual reserve
- [ ] Set `NEXT_PUBLIC_SOLANA_PROGRAM_LAUNCHPAD` + `SOLANA_PROGRAM_LAUNCHPAD` in VM `.env`
- [ ] Set `SOLANA_CHAIN_ID=901101` and `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`

## Indexer

- [ ] `pump-indexer-sol` systemd active (`deploy/pump-indexer-sol.service`)
- [ ] `REDIS_PUBLISH_ENABLED=true` for arena WS
- [ ] `INCREMENTAL_BOARD_STATS=true`
- [ ] Migration `045_solana_address_checks.sql` applied
- [ ] Helius mainnet RPC + rotate API keys (never commit keys)
- [ ] Optional: `SOLANA_INDEXER_SOURCE=laserstream` when gRPC client ships (RPC fallback today)

## Ops

- [ ] `deploy/vm/system-health.sh` — `pump_indexer_sol` check green
- [ ] Smoke: login → create → buy → arena row → portfolio holding
- [ ] Treasury withdraw path tested with ops wallet
- [ ] Custodial key encryption audit (`solana_wallets.encrypted_secret_key`)

## Rollback

- Revert `NEXT_PUBLIC_CHAIN_FAMILY` only if keeping EVM staging; production target is Solana-only per `deploy/SOLANA_CUTOVER.md`.
