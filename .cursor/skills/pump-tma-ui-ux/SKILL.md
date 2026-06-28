---
name: pump-tma-ui-ux
description: >-
  UI/UX standards for the Pump launchpad: layout shell, component classes,
  pump-* tokens, trading boards, and page patterns. Use when building pages,
  modals, forms, trading boards, or styling changes in pump-tma.
---

# Pump UI/UX

## Design system (required)

**Read `.cursor/skills/pump-tma-design-system/SKILL.md` first** for navigation patterns, color tokens, typography, spacing, radius, dock layout, and data hierarchy. This file covers implementation conventions in the repo.

## Product context

BSC meme launchpad — **web-only** pro trader terminal with rewards layer. Desktop-first with mobile bottom tab bar. Turkish users may appear — keep UI English, use clear financial labels.

## Layout

| Piece | Location | Notes |
|-------|----------|-------|
| Shell | `AppShell` | Top header + main; no sidebar |
| Width/padding | `layout-shell.ts` | `max-w-[1600px]` default; `wide` → `max-w-[1920px]` |
| Desktop nav | `AppHeader` | Horizontal links after logo; Create + wallet right |
| Mobile nav | `AppNav` | Fixed bottom tab bar; hidden on `/token/*` |
| Token detail | `AppShell wide` | Wider max-width for chart + trade panel |

**Always wrap page content in `AppShell`** (see existing `page.tsx` files).

## Design system (no shadcn)

Custom **fintech terminal** system in `src/app/globals.css` `@layer components`:

- **Surfaces**: `panel-surface`, `panel-interactive` (8px radius)
- **Typography**: `page-kicker`, `page-title`, `section-heading`, `section-label`, `card-title`
- **Forms**: `field-label`, `field-hint`, `field-input`, `field-textarea`
- **Buttons**: `primary-button`, `secondary-button`, `chip-button` (+ variants)
- **Modals**: `modal-backdrop`, `modal-panel` + `ModalPortal` from `src/components/ui/`
- **Data**: `metric-value`, `financial-value` (mono numbers)
- **Tabs**: `sheet-tabs`
- **Nav**: `app-header-nav`, `header-nav-link`, `bottom-nav`, `bottom-nav-item`, `bottom-nav-fab`

Tailwind tokens: `text-h1`…`text-caption`, `text-pump-*`, `bg-pump-*`, `border-pump-*`.

## Themes

Two Coinbase CDS themes via `data-theme` on `<html>`: `light`, `dark`. CSS vars in `globals.css`; logic in `src/lib/theme.ts`. First visit follows `prefers-color-scheme` (fallback dark); sun/moon toggle saves explicit preference.

## Icons & loading

- Icons: `lucide-react` with `ICON_STROKE` from `src/lib/icons.ts`
- Section icons: `SectionHeadingIcon`, `IconLabel` from `src/components/ui/IconLabel.tsx`
- Skeletons: `Skeleton` component + route-level `loading.tsx` with `AppShell`
- Metric icons: `MetricIcons` in `src/lib/metric-icons.ts`

## Web layout constraints

- Touch targets ≥ 44px on primary actions
- Modals: bottom sheet on mobile (`modal-backdrop-shell` aligns `flex-end` below `sm`)
- Token pages: chart + trade panel side-by-side from `lg` breakpoint
- **Mobile token detail** (`TokenDetailLive`, `< lg`):
  - Fixed bottom dock: `token-trade-dock` — **Buy | Sell only** (no price row)
  - Opens `TradeSheet` → `TradePanel`
  - Main column: `pb-[var(--mobile-token-footer-height)]`
  - Bottom tab bar hidden on token routes
  - Deep links: `?trade=buy` / `?trade=sell` via `parseTradePrefillFromSearchParams`
  - Desktop `lg+`: inline `TradePanel` in sticky aside; no dock
- **Graduation UI disabled** — do not show `progressBps` or graduation progress bars; field may exist in token data for future use
- Non-token mobile pages: `padding-bottom: var(--mobile-bottom-nav-height)` on main

## Trading UI patterns

Follow `ArenaListClient` and token detail components:
- Arena view toggle: Board vs Cards; `pump-arena-view` in localStorage
- Cards sort/density: `pump-arena-cards-sort`, `pump-arena-cards-density`
- Watchlist panel (desktop xl+): `pump-watchlist-panel-collapsed`
- Mobile watchlist: `ArenaWatchlistSheet` bottom sheet
- Arena filter: `pump-arena-filters`
- Activity ticker from board/KOTH data
- Color semantics: `pctTone()` for green/red; `pump-success` / `pump-danger`
- Live updates via `useLiveChannel.ts` — preserve flash animations
- Format helpers: `src/lib/arena-board-format.ts`, `src/lib/format-usd.ts`

## Accessibility

- `aria-label` on nav regions
- `aria-current="page"` for active nav item
- `aria-hidden` on decorative icons
- Focus rings on `.field-input:focus` — don't remove
- Skeleton `aria-hidden`

## UI verification

Use `cursor-ide-browser` MCP to snapshot/screenshot after significant UI work. Dev server: `npm run dev` on port **3012**.

## Do not

- Add shadcn, MUI, or new CSS frameworks
- Use raw hex colors — use `pump-*` tokens or CSS vars
- Reintroduce left sidebar navigation
- Put price/mcap in mobile trade dock
- Invent new button styles — extend `primary-button` / `secondary-button`
