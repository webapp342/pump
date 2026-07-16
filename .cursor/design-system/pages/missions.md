# Rewards hub — UI overrides

Overrides `MASTER.md` for `/missions` only (internal route). Product: **Rewards** loyalty hub.

## Naming (user-facing)

Fintech pattern: Rewards hub + Challenges + Perks + Leaderboard. Currency: **XP**.

| Surface | Label |
|---------|-------|
| Nav | Rewards |
| Status | Available XP · Rank (+ tip) |
| Tabs | Challenges · Perks · Leaderboard |
| Perks sub | Catalog · Owned |
| List column | Challenge |

Do not show “Missions” or “Pump Points” in UI. Route `/missions` may stay for now.

## Product model

| Surface | Behavior |
|---------|----------|
| Route | `/missions` · `?tab=earn\|market\|leaderboard` (`levels` redirects to earn) |
| Challenges | System + admin_link tasks |
| Ranks | Shown in status tip (lifetime XP ladder) — no hub tab |
| Perks Catalog | Redeem via `POST /api/missions/redeem` |
| Perks Owned | `GET /api/missions/inventory` |
| Leaderboard | Top 100 by lifetime XP · reward pool = 25% of treasury (USD) · share ∝ XP weight |
| Perk effects | Catalog copy = product contract; effect wiring still TODO |
| Copy source | `apps/web/src/lib/rewards-copy.ts` · catalog `points-market-catalog.ts` |

Migration: `db/migrations/036_points_redeem.sql`

## Layout

1. Status strip: Available XP (hero) · tier name + tip · progress — elevation-1 panel  
2. Hub tabs: Challenges · Perks · Leaderboard  
3. Challenges / Perks cards: `--missions-panel-bg` = `--pump-card` (global elevation-1) + edge vs page `--pump-bg`  
4. Leaderboard: Reward pool + #1 share + Seats (mobile: pool + seats only) · XP-weighted table  
5. Mobile: hide hub + filter refresh controls

## Panel surface rule (Rewards)

App-wide dark panels use elevation-1 (`--pump-card` = `#141519`). Rewards matches that via `--missions-panel-bg`.

## Out of scope

Seasons automation, streaks, admin catalog CRUD, on-chain fee wiring, leaderboard payout execution, URL rename to `/rewards`.
