---
name: pump-tma-design-system
description: >-
  Research-backed design system for Pump launchpad: navigation patterns, color
  tokens, typography, spacing, component layout specs, and data hierarchy. Use
  for any UI/UX work, redesigns, or styling decisions in pump-tma.
---

# Pump Design System

Authoritative visual and layout spec for Pump. Supersedes spreadsheet/Excel metaphors. Align with sector leaders (pump.fun, DexScreener, Binance Lite, Robinhood crypto) while projecting **credible fintech** — not meme-casual, not enterprise-boring.

## Design principles

1. **Sector-standard navigation** — Top horizontal bar on desktop; bottom tab bar on mobile. No persistent left sidebar (pump.fun, DexScreener, Binance Lite, Robinhood all use top + bottom patterns, not Excel-style side rails).
2. **Price belongs in content, actions in dock** — Token price, mcap, and 24h change live in the header/chart summary. The mobile trade dock is **actions only**: full-width Buy | Sell split. Never duplicate price left / % right in the dock (non-standard, wastes thumb zone).
3. **Layered dark surfaces** — Avoid flat black and spreadsheet grid lines. Use tonal elevation (`bg` → `surface` → `card`) with subtle borders and 6–8px radius. Reference: DexScreener dark UI, 2025–2026 fintech dark-mode guides (layered `#06080c` base, `#101622` cards).
4. **Data density without grid prison** — Keep pro-trader information density; use row dividers and card containers instead of full cell borders. Tables = clean data tables, not Excel worksheets.
5. **Semantic color discipline** — Green/red for P&L only (universal trading convention). Accent for brand/actions. Muted for labels. WCAG 4.5:1 on body text; supplement red/green with +/- signs.
6. **4px spacing grid** — All padding, gaps, and min-heights on multiples of 4. Touch targets ≥ 44px on primary trade actions.
7. **Motion with purpose** — 100–150ms transitions on hover/focus; live price flash animations preserved. Respect `prefers-reduced-motion`.
8. **Avatar vs logo shape** — **User avatars: circle only.** Token logos, chain marks, list/table marks: **square tile** (`TokenAvatar` default `shape="rounded"`, `NativeLogo`). Do not circle-crop token logos.
9. **Token symbols in UI** — Display `symbol` as stored; **no leading `$`** in portfolio, tables, or modals.

## Supplementary research

For UX audits, anti-patterns, or accessibility checklists on **new** surfaces, run `ui-ux-pro-max` search (see `.cursor/rules/pump-tma-skills.mdc`). **Do not** override Pump tokens, Geist typography, or Coinbase CDS palette with generic skill output.

## Research references

| Pattern | Sector standard | Sources |
|---------|-----------------|---------|
| Desktop nav | Top bar: logo left, primary links inline, wallet + CTA right | pump.fun web, DexScreener, Binance Lite |
| Mobile nav | Fixed bottom tab bar (4–5 items), thumb-zone | pump.fun app, Exodus/Robinhood mobile, Lazarev crypto UX 2025 |
| Mobile token dock | Buy + Sell only, 50/50 split, ≥48px height; opens trade sheet/modal | pump.fun mobile help center, GTokenTool pump.fun flow |
| Token page hierarchy | Symbol/avatar → price + change → chart → stats → social → tape | Trading app design guides 2026, pump.fun coin page |
| Dark palette | Layered surfaces, not #000 flat; slightly heavier font weights | tech-rz dark mode 2026, Outcrowd fintech 2026 |
| Typography | Sans UI + tabular mono for numbers | David Pham trading UI guide 2026 |

**When to use sidebar:** Settings dashboards, admin panels, documentation — **not** consumer trading/discovery apps. Pump is discovery + trade; top nav + bottom bar only.

## Color palette (semantic tokens)

Defined in `globals.css` as RGB triplets for `rgb(var(--pump-*))`.

Two Coinbase CDS themes: `light`, `dark`. Default resolved theme: system preference via `prefers-color-scheme`, fallback `dark`. User override via sun/moon toggle → `localStorage` `pump-theme`.

| Token | CDS light | CDS dark |
|-------|-----------|----------|
| `--pump-bg` | gray5 `#F7F8F9` | gray0 `#0A0B0D` |
| `--pump-card` | `#FFFFFF` | bgElevation2 gray10 `#1E2025` |
| `--pump-card-soft` | gray10 `#EEF0F3` | gray15 `#282B31` |
| `--pump-accent` | blue60 `#0052FF` | blue70 `#578BFA` |
| `--pump-text` | gray100 `#0A0B0D` | `#FFFFFF` |
| `--pump-muted` | gray60 | gray60 `#8A919E` |
| `--pump-success` / `--pump-danger` | green60 / red60 | green60 / red60 |

**Elevation ladder (dark):** `#0A0B0D` → `#141519` → `#1E2025` → `#282B31` — color steps, not borders (Coinbase CDS `bgElevation1/2`).

## Typography

**Source of truth:** `apps/web/src/app/typography-theme.css` (Coinbase CDS product scale).  
**Docs:** `.cursor/design-system/designs.md` → Central typography system.

| CDS role | Size | Weight | Use |
|----------|------|--------|-----|
| `display1–3` | 64 / 48 / 40 | 400 | Marketing only |
| `title1` / `title2` | 28 | 600 / 400 | Page title |
| `title3` / `title4` | 20 | 600 / 400 | Sheet/modal title, section |
| `headline` | 16 | 600 | CTA, identity, emphasis |
| `body` | 16 | 400 | Default copy, inputs |
| `label1` / `label2` | 14 | 600 / 400 | Tables, nav, dense UI |
| `caption` | 13 | 600 | Uppercase headers |
| `legal` | 13 | 400 | Helpers, meta, USD |

Semantic aliases (`--text-body`, `--text-nav`, …) map to these roles. Tailwind `text-sm` / `text-xs` / `text-base` also map to CDS. Prefer `.type-label1` / `--type-*` for new code. Swap themes via `[data-type-theme]`.

- **UI:** Geist Sans (`--font-geist-sans`)
- **Numbers:** `.financial-value` + `tabular-nums` (mono stack)
- **Dense product UI:** prefer label/legal/caption over body (CDS Text guidance)

## Media sizes (avatars / logos / icons)

**Source:** `apps/web/src/app/size-theme.css` + `@/lib/ui-sizes` · `data-size-theme="pump-cds"`

| Kind | Roles | Default |
|------|-------|---------|
| User avatar | xs16 → preview64 | `2xl` (40) |
| Token/chain logo | xs16 → row52 | `sm` (20) |
| Icon | xs12 → xl28 | `md` (20) |

Use `size="xl"` / `PumpIcon size="sm"` — never invent 14/18px. Portfolio identity = `lg` (32). Icons: Coinbase CDS via `PumpIcon` + `active` for selected states; social via `BrandIcons`.

## Spacing (4px grid)

| Name | Value | Use |
|------|-------|-----|
| `xs` | 4px | Tight inline gaps |
| `sm` | 8px | Chip gaps, icon gaps |
| `md` | 12px | Input padding, card padding mobile |
| `lg` | 16px | Section gaps |
| `xl` | 24px | Between major sections |
| `2xl` | 32px | Page vertical rhythm |

Shell horizontal padding: `px-3 sm:px-4 md:px-5 lg:px-6` via `layout-shell.ts`.

## Border radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 4px | Badges, small chips |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 8px | Panels, cards |
| `--radius-xl` | 12px | Modals, bottom sheets |
| `--radius-full` | 9999px | FAB, avatars |

**Not 2px.** Spreadsheet radius is deprecated.

## Navigation spec

### Desktop (≥ md)

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo]  Arena  Airdrops  Missions  Portfolio  [Admin?]     │
│                                    [Theme] [Create] [Wallet] │
└─────────────────────────────────────────────────────────────┘
```

- `AppHeader`: sticky top, single row, `z-index: 50`
- Active link: bottom border accent + semibold (not left sidebar rail)
- **Create**: accent `toolbar-btn-accent`, always visible right cluster
- No `AppNav` sidebar

### Mobile (< md)

```
┌──────────────────────────────────────────────────┐
│ [Logo]                        [Theme] [Wallet]   │
├──────────────────────────────────────────────────┤
│                  (page content)                  │
├──────────────────────────────────────────────────┤
│ Arena  Airdrops  [+Create]  Missions  Portfolio  │  ← 5 direct tabs + center FAB
└──────────────────────────────────────────────────┘
```

- `AppBottomNav` (in `AppNav.tsx`): fixed bottom, `z-index: 40`
- **5 items always visible** — Arena, Airdrops, Create (center elevated FAB), Missions, Portfolio
- **No "More" menu** — all primary destinations are direct tabs
- **Create**: center elevated FAB (`bottom-nav-fab`); sole mobile Create entry point (header Create hidden below `sm`)
- **Admin** (if applicable): desktop header only, not in bottom bar
- **Hidden on `/token/*`** — trade dock replaces bottom bar on token detail
- Main content: `padding-bottom: var(--mobile-bottom-nav-height)` when bar visible

### Token detail mobile

```
┌──────────────────────────────────────┐
│ Avatar  $SYMBOL  creator · age  ☆    │
│ Price + 24h% (in chart header)       │
│ Chart → stats → tape                   │
├──────────────────────────────────────┤
│  [    Buy $SYMBOL    ] [ Sell ... ]  │  ← trade dock only
└──────────────────────────────────────┘
```

- `--mobile-trade-dock-height`: ~3.25rem + safe-area
- Dock: `grid 1fr 1fr`, gap 8px, buttons `min-height: 48px`, `border-radius: var(--radius-md)`
- No price row in dock

## Component layout specs

### Header (`app-header`)
- `min-height: 52px`, border-bottom 1px `--pump-border` / 0.4
- Brand mark: 32px, `--radius-md`, subtle border

### Page intros (optional)
- Primary routes (Arena, Airdrops, Missions, Portfolio, Create) **jump straight to content** — no `page-intro` kicker/title/copy block. Nav labels already identify the page (pump.fun-style).
- Use `page-intro` only when a page needs extra context (admin console, marketing landing) or a sub-route needs a minimal back link without a full hero.
- SEO titles/descriptions stay in `layout.tsx` / `generateMetadata`; visible intros are not required on every page.

### Arena discovery
- Unified toolbar row: search (expand on focus) + Board/Cards toggle attached to search end + watchlist trigger
- Mobile: single row at 375px; watchlist collapses to icon (≥44px) when search focused
- Filter chips in scrollable row below toolbar
- Board: `panel-surface overflow-hidden` + `sheet-grid` (row dividers only)
- Cards: `arena-token-card` with `--radius-lg`, hover accent border
- Watchlist: right panel xl+ only; mobile sheet

### King of the Hill (KOTH) — v6 featured token banner

Pattern: **exchange-style spotlight row** (pump.fun KOTH cards with MC/V/TX, DexScreener pair header price-first + stat grid, Binance hot-token strip) — identity + hero mcap + 2×2 secondary stats. No separate footer row.

Research notes:
- pump.fun token cards: **MC as primary figure**, V/TX as secondary inline metrics; no uppercase floating label above MC.
- DexScreener pair header: **price/mcap hero line** with timeframe deltas adjacent; secondary stats in a **compact grid** (Txns, Volume, Makers).
- Fintech spotlight pattern: **number-first, label-second** (caption under hero or omitted); avoid label-above-value stacks in center zones.

- **Graduation UI disabled** — no progress bar or graduation % anywhere; `progressBps` may remain in API/DB but is not shown.
- **Section title outside card** — `section-header` + `section-heading` ("King of the Hill"); no crown icon in header or card.
- **Reign copy** — `#1 for 23h` under token name in Zone A only. Never "Live".
- **Component** — `koth-banner panel-surface` with `koth-banner__inner` 3-zone layout.
- **Desktop (md+):** flex row, `96–104px` height, padding `16px 20px`, vertical dividers between zones:
  - **Zone A (flex 0):** 56px logo + name (`FOUR · $FOUR`) + muted reign line below name.
  - **Zone B (flex 1, center):** hero line `$3,163` + `+0.40% 24h` inline (colored delta, no pill); tiny `Mcap` caption below (sentence case, `text-caption`).
  - **Zone C (flex 0, right):** `koth-banner__stats-grid` 2×2 equal cells (`Vol | Trades` / `Holders | ATH`) — label caption top, `financial-value` below; subtle 1px cell borders via gap grid; chevron outside grid, vertically centered.
- **Mobile:** stack — identity row → mcap hero row → full-width 2×2 stats grid (no chevron).
- **ATH data:** `athMarketCapBnb` from `TokenListItem` (DB: `ath_price_zug × supply`), USD via `bnbToUsd` + `formatCapForBoard`; fallback to current `marketCapBnb`.
- **Visual:** subtle left-to-right gradient `accent/5 → card`; hover `border-pump-accent/40`; no crown, no accent stripe.
- **Contenders strip:** horizontal `contender-chip` row below; label "Recent" only.

### Trade panel (desktop aside)
- Sticky `top: 5rem`, width 340px
- Buy/Sell segment at top, amount input, slippage, submit

### Cards (`panel-surface`)
- `border-radius: var(--radius-lg)`
- `border: 1px solid rgb(var(--pump-border) / 0.35)`
- No box-shadow on default; shadow only on modals/FAB

## Data display hierarchy

1. **Primary metric** — largest mono figure (price, portfolio total)
2. **Delta** — adjacent caption, colored +/- pct
3. **Secondary metrics** — caption labels above, body-sm values
4. **Tertiary** — muted caption (age, address, tx hash)
5. **Actions** — buttons visually separated from data (dock, toolbar)

Never bury price below fold on mobile token page — chart component summary row carries it.

## Motion & accessibility

- Transition: `150ms ease` on interactive surfaces
- Focus: visible ring on inputs (`outline` accent / 0.65)
- `aria-label` on nav regions; `aria-current="page"` on active tab
- `prefers-reduced-motion: reduce` — disable ticker scroll, reduce flash duration
- Bottom nav + dock: `env(safe-area-inset-bottom)`

## Implementation map

| Concern | Files |
|---------|-------|
| Tokens & components | `src/app/globals.css` |
| Shell | `AppShell.tsx`, `AppHeader.tsx`, `AppNav.tsx`, `layout-shell.ts` |
| Token dock | `TokenDetailLive.tsx`, dock classes in `globals.css` |
| Nav config | `src/lib/nav-config.tsx` |

## Do not

- Reintroduce left sidebar for primary navigation
- Use 2px radius as default
- Put price + % in mobile trade dock
- Add shadcn/MUI without explicit approval
- Use raw hex — always `pump-*` tokens or CSS vars
