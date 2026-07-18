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

## Phase C1 — Contracts

### KolMarketEscrow (deployed Base Sepolia)

- Address: `0x7233D1a93a13772De23068070fb0b88614715915`
- Owner / relayer: `0x11Ea71d1BEb04Aece4d06a585D9dbc6F58836880`
- JSON: `contracts/deployments/base-sepolia-kol-escrow.json`

```env
NEXT_PUBLIC_KOL_MARKET_ESCROW=0x7233D1a93a13772De23068070fb0b88614715915
KOL_ESCROW_RELAYER_PRIVATE_KEY=0x…   # owner private key
```

### BondingCurveManager — verified KOL fee (storage-safe upgrade)

New vars are **appended after `emergencyHalt`** (not inserted mid-layout). `__gap` reduced 39 → 37.

```bash
cd contracts

export RPC_URL="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
export DEPLOYER_PRIVATE_KEY="0x..."   # must be LAUNCHPAD_OWNER
export PROXY_ADDRESS="0x0f8b0052F7750e6d481DBb447FD4b7b45ac3b615"

forge script script/UpgradeCore.s.sol:UpgradeBondingCurve \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvv
```

Post-upgrade (initialize does not re-run on existing proxy):

```bash
cast send "$PROXY_ADDRESS" "setVerifiedReferrerShareBps(uint256)" 2500 \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY"

cast call "$PROXY_ADDRESS" "verifiedReferrerShareBps()(uint256)" --rpc-url "$RPC_URL"
# expect 2500

# Per KOL (when DB tier = verified):
cast send "$PROXY_ADDRESS" "setVerifiedKol(address,bool)" 0xKOL_ADDRESS true \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY"
```

**Remaining:** deploy escrow ✅ · BCM upgrade (run above) · web env · ABI sync optional.

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
