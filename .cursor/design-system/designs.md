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
[ Avatar 36 ][ Username OR 0x… ][Copy]     |     [ Missions ][ Share ][ Menu ]
```

- Copy is **adjacent** to the label (`inline-flex`, no `flex-grow` on the name) — never spanning the gap to the toolbar
- Soft divider between identity cluster and toolbar
- All trailing toolbar icons same box size (36px) and vertically centered with avatar
- Copy sits with **identity**, not mixed into toolbar as a 4th sibling without separation

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
| Portfolio top identity | Avatar + **one** name/address line; copy is a **trailing icon**, not a second text row | Avatar 32–36px circle · one truncated primary label · copy ≥44×44 on the **right of the identity cluster** |
| Address exposure | Address lives on Portfolio identity / Deposit — not inside Settings | Settings has **no** address row |
| Balance block | Label → large amount → tiny secondary equiv · unit toggle on the **same row as amount** | Portfolio hero only; not in Settings |
| Quick fund actions | Equal split Deposit / Withdraw, sentence case, equal height | Portfolio hero 3-col / desktop dropdown only |
| Settings list | Full-width rows: icon + label left · control right · **equal row height** | Edit profile / Push toggle / Appearance value / Log out |
| Sheets chrome | Title left, **Close top-right**, grip above — never Close under subtitle | See `pages/sheets.md` |

---

## Portfolio mobile hero — identity

**Layout (left → right):**

```
[ Avatar 32–36 ]  [ Username OR short address ]     [ Copy ]  [ ··· toolbar ]
```

| Do | Don't |
|----|--------|
| One primary line only (username if set, else short address) | Username **and** second address+copy line under it |
| Avatar large enough to read (32–36px), circular | Tiny ~20–22px avatar that looks like a favicon |
| Copy icon only as trailing control | Duplicate address text next to copy |
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

## Typography scale (wallet / sheet interiors)

| Role | Token |
|------|--------|
| Sheet title | `--text-h3` |
| Sheet subtitle | `--text-caption` muted |
| Balance amount | ≤ `--text-h2` (sheet); portfolio page hero may be larger |
| Settings label | `--text-body-sm` medium |
| Helper / address | `--text-caption` muted |
| Field labels | `--text-label` uppercase **or** sentence body-sm — pick one per surface |

Never use `--text-display` / page H1 inside sheets or account panels.

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
