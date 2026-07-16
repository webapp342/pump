# Pump — Corporate UI bar (`designs.md`)

**Permanent product requirement:** every surface must feel like a **credible fintech terminal** (Coinbase Wallet / Robinhood crypto / CDS density) — not a meme toy UI, not a debug console, not a marketing landing.

Agents must read this file on **any** Portfolio / Account / Sheet / Modal / Wallet UI work. Do **not** wait for the user to restate “kurumsal / corporate / equal alignment”.

Related: `MASTER.md`, `pages/sheets.md`, `pages/portfolio.md`, `pump-tma-design-system`.

---

## Mobile Settings sheet (hamburger / account menu)

Title: **Settings** (not Account).

| Include | Exclude |
|---------|---------|
| Edit profile | Available to trade / balance |
| Push notifications (On/Off **toggle**) | Wallet address + copy |
| Appearance (`Dark` / `Light` value, no duplicate sun) | Deposit / Withdraw |
| Log out | Debug / SW diagnostics |

Portfolio hero already has balance + Deposit/Withdraw — do not duplicate in Settings.

**Alignment:** Header title/X and Settings row content share one horizontal gutter (`1rem`). List has **no** card border — only full-bleed bottom dividers (sheet width). Icons align under “Settings”; trailing controls align under the close column.

## Mobile Create sheet

Same chrome as Settings: title **Create** (no leading +), full-bleed dividers, `1rem` content gutter aligned with title/X. Rows: icon · label + caption · chevron. No bordered option cards.

## Mobile Deposit / Withdraw sheets

Same chrome: no `panel-surface` field cards. Form rows use full-bleed bottom dividers; inputs are borderless inside the `1rem` gutter (aligned with title/X). Deposit: QR + address row + footer **Done**. Withdraw: Asset / Amount / Destination fields + footer Cancel|Withdraw.

---

## Portfolio mobile identity

```
[ Avatar 32 ][ Username OR 0x… ][Copy]     |     [ Missions ][ Share ][ Menu ]
```

- Copy is **adjacent** to the label (`inline-flex`, no `flex-grow` on the name) — never spanning the gap to the toolbar
- Soft divider between identity cluster and toolbar
- All trailing toolbar icons same box size (36px) and vertically centered with avatar
- Toolbar **glyphs 20px** — optical weight matches 32px avatar (not 24px chunky icons)
- Copy sits with **identity**, not mixed into toolbar as a 4th sibling without separation
- Entire top row: `align-items: center`, shared `min-height: 36px`
---

## Non-negotiable principles

1. **One job per row** — Identity, balance, actions, settings never compete in the same cluster.
2. **4px spacing grid** — Padding/gaps/min-heights on multiples of 4. Prefer 16 / 12 / 8.
3. **Touch ≥ 44px** on primary/icon actions (`2.75rem`).
4. **Single visual rhythm** — Same label size, same row height, same right-edge alignment in a settings list.
5. **No production debug UI** — Worker scopes, localhost URLs, SW controller dumps stay behind `NODE_ENV === "development"` (or a explicit debug flag). Never ship in Settings sheet.
6. **Pump tokens only** — Ignore ui-ux-pro-max amber/purple palettes; keep `pump-*`.
7. **Sentence-case CTAs** — Deposit / Withdraw on Portfolio hero (not uppercase section labels for buttons).

---

## Research-backed wallet patterns (sector)

| Surface | Corporate pattern (Coinbase Wallet / Robinhood / CDS) | Pump rule |
|--------|------------------------------------------------------|-----------|
| Portfolio top identity | Avatar + **one** name/address line; copy is a **trailing icon**, not a second text row | Avatar **32px** circle · toolbar glyphs **20px** in 36px hit · one truncated primary label · copy with identity |
| Address exposure | Address lives on Portfolio identity / Deposit — not inside Settings | Settings has **no** address row |
| Balance block | Label → large amount → tiny secondary equiv · unit toggle on the **same row as amount** | Portfolio hero only; not in Settings |
| Quick fund actions | Equal split Deposit / Withdraw, sentence case, equal height | Portfolio hero 3-col / desktop dropdown only |
| Settings list | Full-width rows: icon + label left · control right · **equal row height** | Edit profile / Push toggle / Appearance value / Log out |
| Sheets chrome | Title left, **Close top-right**, grip above — never Close under subtitle | See `pages/sheets.md` |

---

## Portfolio mobile hero — identity

**Layout (left → right):**

```
[ Avatar 32px ]  [ Username OR short address ][ Copy ]     |     [ ··· toolbar ]
```

| Do | Don't |
|----|--------|
| One primary line only (username if set, else short address) | Username **and** second address+copy line under it |
| Avatar **32px**, toolbar glyphs **20px**, shared vertical center | Tiny 24px avatar + oversized 24px toolbar glyphs |
| Copy icon only as trailing control on identity | Duplicate address text next to copy |
| Prefer truncated `@username` when not address-like | Force full 0x in the title line when username exists |

**Balance** stays **centered** below (portfolio net equity) — that is the hero number, not the identity block.

---

## Mobile Settings sheet — structure

1. **Edit profile** — row → opens profile editor
2. **Push notifications** — On/Off switch (optional callouts sub-toggle when enabled)
3. **Appearance** — leading sliders icon · trailing `Dark` / `Light` text control (no second sun)
4. **Log out** — danger row, last

No balance, address, Deposit, or Withdraw. Diagnostics **dev only**.

---

## Central typography system (Coinbase CDS)

**Source of truth:** `apps/web/src/app/typography-theme.css`  
**Official CDS refs:** [CDS Text](https://cds.coinbase.com/components/typography/Text/) · [CDS Theming](https://cds.coinbase.com/getting-started/theming/)

Pump uses **CDS product roles** (size + weight + line-height). Swap themes later by editing only `typography-theme.css` / `[data-type-theme]` — do **not** hard-code `px` in components.

### CDS roles Pump uses (13 roles)

| Role | Size | Weight | Line-height | When to use |
|------|------|--------|-------------|-------------|
| `display1` | 64px | 400 | 72px | Marketing hero only |
| `display2` | 48px | 400 | 56px | Marketing |
| `display3` | 40px | 400 | 48px | Marketing / rare page hero |
| `title1` | 28px | **600** | 36px | Page title (one per page) |
| `title2` | 28px | 400 | 36px | Soft page title |
| `title3` | 20px | **600** | 28px | Sheet/modal title, section |
| `title4` | 20px | 400 | 28px | Soft section |
| `headline` | 16px | **600** | 24px | Emphasized row, CTA label, identity |
| `body` | 16px | 400 | 24px | Default copy, form input |
| `label1` | 14px | **600** | 20px | Dense table primary, nav |
| `label2` | 14px | 400 | 20px | Dense secondary, tabs |
| `caption` | 13px | **600** | 16px | Uppercase table headers / overlines |
| `legal` | 13px | 400 | 16px | Helpers, meta, USD under balance |

CSS: `--type-{role}-size|weight|leading` · utilities: `.type-body`, `.type-label1`, `.type-headline`, …

### App surface → CDS role map

| Surface | Role |
|---------|------|
| `body` / paragraphs | `body` |
| Page H1 | `title1` |
| Sheet / modal title (`h2`) | `title3` |
| Modal subtitle / hint | `legal` |
| Primary / secondary button | `headline` (16/600) |
| Top nav link | `label1` |
| Bottom nav label | `caption` |
| Tab (idle / active) | `label2` / `label1` |
| Table header | `caption` |
| Table cell primary (coin, amount) | `label1` |
| Table cell secondary (symbol, $) | `legal` |
| Metric hero $ | `title3` or `headline` |
| Metric label | `legal` |
| Financial numbers | `.financial-value` + parent role size; mono + tabular-nums |

### Dense product UI (CDS guidance)

For trading / portfolio / sheets with many rows, prefer **`label1` / `label2` / `legal` / `caption`** over `body` — CDS Text docs: labels may replace body in extraordinarily dense interfaces.

Mobile and desktop use the **same CDS sizes** (product CDS is fixed). Dense desktop only switches data rows to label/legal via `--text-ui-body` → `label1` at `≥768px`.

### Agent rules

1. Never set `font-size: 0.75rem` etc. in new CSS — use `--type-*` or `--text-*` aliases.
2. Prefer `.type-label1` / semantic tokens over Tailwind `text-sm` / `text-xs`.
3. To try another foundry scale: duplicate the theme block as `[data-type-theme="…"]` and flip `dataset.typeTheme`.
4. Sheets: never `title1` / `display*` for in-sheet identity rows.

### Creator profile sheet (CDS mapping)

| Element | CDS role |
|---------|----------|
| Address / username | `headline` |
| Followers / Following | `legal` (+ strong `caption` weight on count) |
| Earnings label | `legal` |
| Earnings value | `headline` |
| Tab | `label2` |
| Table header | `caption` |
| Coin / balance | `label1` |
| Symbol / USD | `legal` |

Header grid unchanged: avatar · identity+explorer · Follow. Empty earnings → `$0`.

### Trade Buy/Sell sheet (CDS mapping)

| Element | CDS role |
|---------|----------|
| Symbol (ZNS) | `headline` |
| Change % | `legal` (+ caption weight) |
| Buy / Sell toggle | `label1` / `label2` idle |
| TOTAL / field label | `caption` (uppercase) |
| Avail. | `legal` (amount `caption` weight) |
| Amount input (mobile) | `title1` |
| Amount input (desktop) | `body` + headline weight |
| USD \| TOKEN chip | `legal` |
| 25% / 50% / Max | `label2` (+ label1 weight) |
| Order value label / USD | `legal` |
| Order value tokens | `label1` |
| Numpad keys | `title3` |
| Buy / Sell CTA | `headline` |

Tokens: `--text-trade-*` in `typography-theme.css`.

---

## Central media sizes (avatars / logos / icons)

**Source of truth:** `apps/web/src/app/size-theme.css` + `apps/web/src/lib/ui-sizes.ts`  
**Theme id:** `data-size-theme="pump-cds"`

4px-grid steps only: **12 · 16 · 20 · 24 · 28 · 32 · 36 · 40 · 48 · 52 · 64**. No 14/18/22/26/44.

| Kind | Roles (px) | Default |
|------|------------|---------|
| User avatar (circle) | xs16 · sm20 · md24 · lg32 · xl36 · 2xl40 · 3xl48 · picker52 · preview64 | `2xl` |
| Token / chain logo (square) | xs16 · sm20 · md24 · lg28 · xl32 · 2xl36 · 3xl40 · row52 · hero52 | `sm` |
| Icon (PumpIcon) | xs12 · sm16 · md20 · lg24 · xl28 | `md` |

**Rules**

1. Prefer `size="xl"` / `USER_AVATAR_SIZE.xl` / `TOKEN_LOGO_SIZE.sm` — never invent raw px in new UI.
2. Portfolio identity avatar: `xl` (36). Sheet profile: `2xl` (40). Header chip: `md` (24).
3. Table / holdings logos: `sm` (20) via `--token-logo-size-inline`.
4. Icons: `PumpIcon size="sm"` or `.icon-sm` — not `h-3 w-3` / `text-xs`.
5. To retune the whole app, edit `size-theme.css` only.

---

## Anti-patterns (blocked)

- Close (X) stacked under titles (missing flex chrome)
- Debug strings in production settings
- Mismatching right edges in settings (Enable vs Appearance toggle vs Edit profile)
- Duplicate address presentation (hero + sheet + oversized copy tile)
- Marketing purple / gold from generic design-system skill output
- Oversized avatars as the page hero competing with $ balance

---

## Agent checklist (before shipping UI)

- [ ] Read this file + relevant `pages/*.md`
- [ ] Sheet header is a horizontal flex with Close top-right
- [ ] Identity uses **one** label line + trailing copy
- [ ] No `diagnostics` / SW scope strings in prod Account UI
- [ ] Settings rows share height / padding / icon column
- [ ] CTAs sentence case, ≥44px
- [ ] Visual check at 375px width
- [ ] Typography uses `--type-*` / `.type-*` (CDS) — no raw px font-size
- [ ] Creator profile: explorer icon immediately after address
- [ ] `data-type-theme="coinbase-cds"` on `<html>` (ThemeProvider)
