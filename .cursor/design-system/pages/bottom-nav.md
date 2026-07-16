# Mobile bottom navigation — UI overrides

Overrides `MASTER.md` for `AppNav` / `.bottom-nav` only.

## ui-ux-pro-max / web domain checklist

| Rule | Pump status |
|------|-------------|
| **3–5 primary tabs** max | ✓ tabs (Arena, Airdrops, Rewards, Portfolio) |
| **Safe area** inset bottom | ✓ `--mobile-bottom-nav-offset` uses `env(safe-area-inset-bottom)` |
| **Icon buttons need labels** | ✓ `aria-label` on each tab; visible text optional (icon-first dock) |
| **Touch targets** | ✓ `--mobile-bottom-nav-hit-size` 2.5rem (40px) — acceptable with padding |
| **Don't obscure content** | ✓ `padding-bottom: var(--mobile-bottom-nav-height)` on main |

## Pump design system

- Floating pill dock: `.bottom-nav` on `.bottom-nav-host`
- **Icon-first** tabs (no visible caption) — matches pump.fun density; labels in `aria-label` only
- Active tab: `.bottom-nav-item-active` soft surface, full-opacity icon
- Hidden on `/token/*` when trade dock replaces bar
- Trade route: `bottom-nav--trade` + `TokenTradeDockPill`

## Do not (from research)

- Add 6+ tabs without a More menu
- Remove `aria-label` when icons have no visible text
- Shrink hit area below 40px without expanding tap padding

## Optional future polish (not required)

- Visible 10px captions under icons (iOS tab bar style) — increases bar height
- Center FAB for Create — design-system doc mentions FAB; current nav uses 5 equal tabs
