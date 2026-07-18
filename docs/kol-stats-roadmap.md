# KOL stats & marketplace roadmap

Phased delivery for stats rollups, verified KOL tier, and sponsored callouts.

## Phase B1 — DB + indexer (done in code)

- Migration: `db/migrations/042_kol_stats_marketplace.sql`
- Backfill: `db/refresh/backfill_stats_rollups.sql` (run on VM after migration)
- Indexer: `apps/indexer/src/stats-rollups.ts` wired in `handlers.ts`
- Enable: `STATS_ROLLUPS_ENABLED=true` (or same flags as incremental board stats)

**VM apply:**

```bash
sudo -u postgres psql -d pump_db -f db/migrations/042_kol_stats_marketplace.sql
sudo -u postgres psql -d pump_db -f db/refresh/backfill_stats_rollups.sql
```

## Phase B2 — Read APIs (done in code)

| Route | Purpose |
|-------|---------|
| `GET /api/kol-market/explore` | Active KOL listings + rollup stats |
| `GET /api/kol-market/profile?address=` | KOL profile + stats |
| `PUT /api/kol-market/profile` | Upsert listing (min price, bio, active) |
| `GET /api/kol-market/stats?address=` | User rollup stats only |
| `GET /api/referrals/stats?address=` | Referral stats (rollup-first) |

## Phase C1 — Contracts (partial)

- `contracts/src/KolMarketEscrow.sol` — sponsor `lock`, relayer `release`, sponsor `refund`
- `BondingCurveManager.sol` — `verifiedKol`, `verifiedReferrerShareBps` (25% default)

**Remaining:** deploy escrow, set env, regen ABIs, contract tests, on-chain `setVerifiedKol` job.

## Phase C2 — Sponsored callout flow (done in code)

1. Sponsor creates draft request (`POST /api/kol-market/requests` with `draft: true`)
2. Sponsor calls `KolMarketEscrow.lock(requestId, kol)` with ETH value
3. Sponsor confirms tx (`PATCH /api/kol-market/requests`)
4. KOL accepts → sponsored `token_announcements` row (`is_sponsored=true`)
5. Relayer `release()` when `KOL_ESCROW_RELAYER_PRIVATE_KEY` is set

**Env:**

```env
NEXT_PUBLIC_KOL_MARKET_ESCROW=0x…
KOL_ESCROW_RELAYER_PRIVATE_KEY=0x…   # escrow owner key; optional until deploy
```

## Phase C3 — UI (done in code)

- Page: `/kol-market` (`KolMarketPanel`)
- Entry: Rewards hub promo card → `/kol-market`
- Callouts: `TokenAnnouncementsPanel` shows “Sponsored callout” when `isSponsored`

## Verified KOL tier

DB thresholds in `VERIFIED_THRESHOLDS` (`kol-market.ts`):

- 5 qualified invites
- 1 native network volume
- 0.05 avg volume per invitee
- 20% repeat trader rate
- 3 callouts, median 1.5x

`evaluateVerifiedKolTier()` updates `kol_profiles.kol_tier`. On-chain mirror via admin `setVerifiedKol` + 25% referral fee split.

## Not touched (by design)

- Referral invite / first-trade `ReferrerSet` binding flow
- Free callout path (holdings gate + cooldown)

## Next ops checklist

- [ ] Apply migration 042 + backfill on VM
- [ ] Deploy `KolMarketEscrow`, fund relayer owner
- [ ] Set web env vars
- [ ] Cron: `evaluateVerifiedKolTier` for active KOLs + admin on-chain sync
- [ ] Optional: index escrow events in indexer
- [ ] Contract unit tests for verified fee split
