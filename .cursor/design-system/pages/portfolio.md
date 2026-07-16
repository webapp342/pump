# Portfolio page — UI overrides

Overrides `MASTER.md` for `/portfolio` only.

## Mobile hero — identity row

**Corporate pattern:** Coinbase/Robinhood identity cluster — one line only.

| Element | Spec |
|---------|------|
| Avatar | Circle **32–36px** (not ~22px) |
| Primary label | Username (`@name`) **or** short address — never both stacked |
| Copy | Trailing icon button ≥44×44, right of label |
| Forbidden | Second line with address + second copy icon |

See `.cursor/design-system/designs.md` (permanent corporate bar).

## Mobile hero — wallet quick actions

**Pattern:** Coinbase/Robinhood-style **segmented action strip** (not separate tall cards).

| Rule | Value |
|------|--------|
| Actions | **Deposit**, **Withdraw**, **Create** (segmented strip) |
| Layout | 3 separate pills, **icon + label inline** (row), gap 0.5rem |
| Height | `min-height: 2.75rem` (~44px touch) |
| Labels | **`--text-caption` sentence case** — NOT `--text-label` uppercase |
| Icons | Deposit `south_west` · Withdraw `north_east` · Create `add` — inline left of label |

**Typography note:** `--text-label` uppercase is for **section headers / metric captions**, not wallet CTA buttons (Coinbase/Robinhood use sentence case on actions).

**Deposit** → `openDeposit()` · **Withdraw** → `openWithdraw()` · **Create** → mobile bottom sheet (`CreateChoiceSheet`: Token `/create` · Airdrop `/airdrops/create`).

Icon semantics (Material Symbols, matches WalletAccountPanel copy):
- **Deposit** = funds in (`south_west`) — same modal as legacy “Receive”
- **Withdraw** = funds out (`north_east`) — same as legacy “Send”

## Desktop hero toolbar

| Rule | Value |
|------|--------|
| Own portfolio | **Deposit** + **Withdraw** (not Share) |
| Other user's portfolio | **Share** only |
| Copy address icon | `font-size` on Material Symbol, not px box clipping |

**Implementation:** `PortfolioHero.tsx` + `.portfolio-toolbar__funding`.

## Mobile holdings list

- Prefer **card rows** with P/L + trend icon over spreadsheet 3-column header on small screens.
- Swipe row: Buy max / Sell max (existing `HoldingSwipeRow`).

## Earnings tab (formerly “Fees”)

**Terminology:** User-facing copy uses **Earnings**, not “fees” — aligns with ui-ux-pro-max Creator Economy guidance (“monetization display”, avoid “Hidden earnings”).

| Surface | Copy |
|---------|------|
| Tab nav | **Earnings** |
| Card 1 | **Creator earnings** — tokens you launched |
| Card 2 | **Referral earnings** — invites / referred volume |
| URL | `/portfolio?tab=earnings` (legacy `?tab=fees` still works) |
| Card title style | `card-title` sentence case — not `section-label` uppercase |
| Layout | `PortfolioEarningsCard`: title + one-line description + Available (emphasis) + Claimed + Claim |

**Breakdown rows:** Available · Claimed inside each card.

## Launched tab (creator portfolio)

**Same grid as Holdings** — `PortfolioLaunchedList` reuses `portfolio-holdings-mobile` + `portfolio-holdings-grid`.

| Column | Holdings | Launched |
|--------|----------|----------|
| Coin | symbol + square logo | symbol + square logo (**no `$`**) |
| Amount | token balance | **holder count** (compact, no `$`) |
| Value | USD position | **MCAP USD** |
| Value/PNL sub | open P/L USD (omit if none) | 24H % (omit if none) |
| Entry (desktop) | avg entry | empty |
| P/L (desktop) | $ + % | 24H % (omit if none) |
| Sort | Amount + Value headers with ↑↓ | same |

## Logo & symbol rules (portfolio)

- **Circle:** user profile avatars only.
- **Square:** `TokenAvatar` `shape="rounded"` (default), `NativeLogo`.
- **Symbols:** no `$` prefix in UI.

## ui-ux-pro-max searches for this page

```powershell
python .cursor/skills/ui-ux-pro-max/scripts/search.py "touch target icon button row 44px" --domain ux
python .cursor/skills/ui-ux-pro-max/scripts/search.py "skeleton loading wallet portfolio" --domain ux
python .cursor/skills/ui-ux-pro-max/scripts/search.py "real-time trading financial" --domain chart
```

Do **not** use `--design-system` "Bento Grid" / "Vibrant Block-based" output for wallet action buttons on this page.
