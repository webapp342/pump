# Fee Split v2 — On-Chain Spec

**Status:** F3 (implemented local · devnet deploy pending) · **Program:** `programs/pump-launchpad`  
**Total trade fee:** 125 bps (1.25% of trade volume)

## 6-way split (target)

| Bucket | Volume % | Of fee pool | BPS of fee |
|--------|----------|-------------|------------|
| Creator | 0.3125% | 25% | 2500 |
| Referrer | 0.1875% | 15% | 1500 |
| Cashback (XP≥1000) | 0.1250% | 10% | 1000 |
| Clan top-3 pool | 0.3125% | 25% | 2500 |
| Leaderboard top-100 | 0.2125% | 17% | 1700 |
| Platform (treasury) | 0.1000% | 8% | 800 |

**Sum:** 10_000 bps = 100% of fee pool.

Unallocated referrer (no binding) and ineligible cashback (XP&lt;1000) roll into platform share.

## PDAs

| Seed | Owner | Purpose |
|------|-------|---------|
| `creator-fees` | creator pubkey | Existing — manual claim |
| `referrer-fees` | referrer pubkey | Existing — manual claim |
| `cashback-fees` | trader pubkey | Accrue when `user_xp >= 1000` |
| `season-accrual` | global | Weekly top-100 pool accrual |
| `clan-pool-accrual` | global | Weekly top-3 clan pool |
| `protocol-treasury` | global | Platform share |

## Instruction data (buy / sell v2)

```text
sol_in / token_in : u64 LE  @ 0
min_out / min_sol : u64 LE  @ 8
user_xp           : u32 LE  @ 16   (0 = no cashback)
```

Backward compatible: if `data.len() < 20`, treat `user_xp = 0`. Program caps at `min(reported, 10_000_000)`.

## Buy / sell accounts (17)

0 trader · 1 global · 2 curve · 3 liquidity · 4 protocol_treasury · 5 creator_fees · 6 referrer_fees · 7 mint · 8 vault · 9 trader_ata · 10 token · 11 system · 12 referrer_binding · 13 referrer_wallet · 14 cashback_fees · 15 season_accrual · 16 clan_pool_accrual

## Cashback rule

- UI reads `ZSCORE weekly_user_xp {wallet}` from Redis (never ClickHouse).
- Tx includes `user_xp`; program caps at `10_000_000`.
- If `user_xp >= 1000`: accrue **10% of fee pool** to `cashback-fees` PDA for trader.
- Claim IX: `claim_cashback_fees` (tag 11 — same pattern as creator/referrer).

## Season / clan pools (F4)

Accrual during trade (deducted from liquidity vault):
- `clan_pool_bps = 2500` → `clan-pool-accrual`
- `leaderboard_pool_bps = 1700` → `season-accrual`
- Platform → `protocol-treasury`

Settlement worker (off-chain) reads archived Redis ZSETs, computes allocations, chunked on-chain writes.

## Events

- **`FeeSplitV2Event`** — creator, referrer, cashback, clan, season, platform fees + `user_xp` (indexer audit log).
- Legacy **`FeeSplitEvent`** retained in program for reference; v2 trades emit `FeeSplitV2Event` only.

## Anti-spoof

- Program only checks threshold; does not compute XP.
- Indexer logs on-chain `user_xp` vs Redis at trade time (PG audit table — F4).
- Anomaly table in PG for manual review.

## SDK / UI

- `@pump/solana-sdk`: encode v2 buy/sell with `userXp` (21-byte IX data)
- `silent-trade`: `GET /api/xp/weekly?address=` before sign

## Migration

- Devnet: `bash scripts/solana/wsl-pinocchio-deploy.sh` after build.
- Existing tokens pick up v2 split on next trade after program upgrade.
