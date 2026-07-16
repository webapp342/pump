# Missions / Pump Points — UI overrides

Overrides `MASTER.md` for `/missions` only. Product: **Pump Points loyalty hub** (earn + levels + market).

## Product model (V1 + Faz 2 redeem)

| Surface | Behavior |
|---------|----------|
| Route | `/missions` · `?tab=overview\|earn\|levels\|market\|activity` |
| Branding | Hero / status: **Pump Points**; nav label stays **Missions** |
| Earn | Existing system + admin_link missions |
| Levels | `users.points_lifetime` → Rookie → Cyclops |
| Market | Catalog redeem via `POST /api/missions/redeem` → inventory |
| Activity | Ledger (`points_audit_log`) + inventory |
| Spendable | `users.points` (debited on redeem; lifetime never drops) |
| Guest | Same IA with zeros + Sign in footer |

Migration: `db/migrations/036_points_redeem.sql`

## Layout

### Mobile
1. Status card (`PointsStatusCard`): balance · tier chip · progress to next · Completed/Open/Volume  
2. Hub tabs: Overview · Earn · Levels · Market  
3. Overview: featured market + open missions snapshot  
4. Earn: Open/Completed filter + mission rows with CDS icon tiles  

### Desktop (`≥ md`)
1. **Left rail ~360px**: sticky status card + compact level ladder  
2. **Main**: hub tabs + tab body (earn table / market grid / levels)  

## Tokens / components

- Surfaces: `panel-surface` for status + market cards only (interaction containers)  
- Icons: `PumpIcon` CDS; mission row tiles via `missionIcon()`  
- Numbers: `.financial-value` + `pts` unit  
- Volume unit: `NATIVE_SYMBOL` (BNB) — never ETH in guest copy  

## Files

| Piece | Path |
|-------|------|
| Panel | `apps/web/src/components/missions/MissionsPanel.tsx` |
| Status | `PointsStatusCard.tsx` |
| Tabs | `PointsHubTabs.tsx` |
| Body | `PointsHubBody.tsx` |
| Levels | `PointsLevelLadder.tsx` + `lib/points-levels.ts` |
| Market | `PointsMarketGrid.tsx` + `lib/points-market-catalog.ts` |
| CSS | `.missions-page` / `.points-*` in `globals.css` |

## Out of scope (later)

Seasons, streaks, admin market CRUD, on-chain fee-discount wiring.
