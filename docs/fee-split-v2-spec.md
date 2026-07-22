# Fee Split v2 — On-Chain Spec

**Status:** Draft (F3) · **Program:** `programs/pump-launchpad`  
**Total trade fee:** 125 bps (1.25% of trade volume)

## 6-way split (target)

| Bucket | Volume % | Of fee pool | BPS of fee |
|--------|----------|-------------|------------|
| Creator | 0.3125% | 25% | 3125 |
| Referrer | 0.1875% | 15% | 1875 |
| Cashback (XP≥1000) | 0.1250% | 10% | 1250 |
| Clan top-3 pool | 0.3125% | 25% | 3125 |
| Leaderboard top-100 | 0.2125% | 17% | 2125 |
| Platform (treasury) | 0.1000% | 8% | 1000 |

## PDAs

| Seed | Owner | Purpose |
|------|-------|---------|
| `creator-fees` | creator pubkey | Existing — manual claim |
| `referrer-fees` | referrer pubkey | Existing — manual claim |
| `cashback-fees` | trader pubkey | **New** — accrue when `user_xp >= 1000` |
| `season-accrual` | global | **New** — weekly top-100 pool accrual |
| `clan-pool-accrual` | global | **New** — weekly top-3 clan pool |
| `protocol-treasury` | global | Existing — platform share |

## Instruction data (buy / sell v2)

```text
sol_in / token_in : u64 LE  @ 0
min_out / min_sol : u64 LE  @ 8
user_xp           : u32 LE  @ 16   (0 = no cashback)
```

Backward compatible: if `data.len() < 20`, treat `user_xp = 0`.

## Cashback rule

- UI reads `ZSCORE weekly_user_xp {wallet}` from Redis (never ClickHouse).
- Tx includes `user_xp`; program caps at `min(reported, 10_000_000)`.
- If `user_xp >= 1000`: accrue **10% of protocol fee** to `cashback-fees` PDA for trader.
- Claim IX: `claim_cashback_fees` (same pattern as creator/referrer).

## Season / clan pools (F4)

Accrual during trade (deducted from former treasury lump):
- `clan_pool_bps = 3125` → `clan-pool-accrual`
- `leaderboard_pool_bps = 2125` → `season-accrual`
- Remaining platform → `protocol-treasury`

Settlement worker (off-chain) reads archived Redis ZSETs, computes allocations, chunked on-chain writes.

## Anti-spoof

- Program only checks threshold; does not compute XP.
- Indexer audits: compare on-chain `user_xp` vs Redis at trade time.
- Anomaly table in PG for manual review.

## SDK / UI

- `@pump/solana-sdk`: encode v2 buy/sell with optional `userXp`
- `TradePanel`: `GET /api/xp/weekly?address=` before sign

## Migration

- Devnet deploy new program ID or `global.fee_v2_enabled` flag.
- Existing tokens continue v1 fee path until explicitly upgraded.
