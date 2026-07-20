# Pump.fun vs Pump TMA (Solana) — architecture compare

Target: pump.fun-class create + buy/sell UX on Solana, with **no graduation** and **protocol + creator + referral fees**.

## Product differences (intentional)

| Concern | pump.fun | Pump TMA |
|---|---|---|
| Graduation / migrate to AMM | Yes (PumpAMM / PumpSwap) | **No** — permanent bonding curve |
| Protocol fee | Part of 1.25% curve fee | Yes (`protocol_fee_bps`) |
| Creator fee | ~0.30% of notional (share of fee) | Yes (`creator_fee_share_bps`) |
| Referral fee | Volume / affiliate programs | Yes (`referrer_share_bps` + binding PDA) |
| Create platform fee | 0 SOL | 0 SOL (`create_fee_lamports = 0`) |

## On-chain flow (pump.fun pattern → ours)

1. **Create** — mint + Metaplex metadata + bonding-curve PDA + vault ATA  
2. **Buy** — SOL → curve; tokens out of vault; fee split (creator / referrer / treasury)  
3. **Sell** — tokens → vault; SOL out of curve; same fee split  
4. **Index** — decode program logs → Postgres → Redis rooms → live tape / holders

Our program: `programs/pump-launchpad` (Pinocchio). Deployed program id is env-driven (`LAUNCHPAD_PROGRAM_ID`).

## Enterprise Solana stack (Base Alto/AA analogue)

| Base (EVM) | Solana equivalent in this repo |
|---|---|
| Alto bundler + Kernel SCW | Solana **silent** keypair / session wallet (`silent-trade`, `silent-create`) |
| UserOp + paymaster | Single signed versioned tx + optional fee payer (RPC) |
| Receipt log decode | Program log / Anchor-style event decode (`apps/indexer-sol`) |
| Realtime rooms `token:0x…` | Rooms **must preserve base58 case** (`token:{mint}`) |
| Postgres lowercase addresses | Migrations **045–047** drop lowercase CHECKs; app uses `dbStorageAddress` |

## Indexer / UI contract

- Store mint + trader as **canonical base58** (never `.toLowerCase()`).
- Publish Redis `token:{mint}` matching realtime `tradeRoom`.
- On trade confirm without EVM receipt: **promote** `pending:*` → signature so Trades tape stays filled until DB row arrives.
- Update `holder_count` incrementally on position 0↔>0 transitions.

## Fee defaults (aligned with pump.fun bonding fee band)

See `programs/PUMP_FEEL.md` and `PUMP_FEEL_DEFAULTS` in `@pump/solana-sdk`:

- `protocolFeeBps = 125` (1.25%)
- `creatorFeeShareBps = 2400` (24% of fee → ~0.30% of notional)
- Remainder → treasury; referrer share from remaining when binding exists

## Ops checklist after deploy

1. Apply migration `047_solana_remaining_address_checks.sql`
2. Redeploy web + realtime + indexer-sol
3. Redeploy program if buy/sell account checks changed
4. Smoke: create → buy small SOL → Trades + Holders populate; sell path
