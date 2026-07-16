# Pump — UI/UX Master (ui-ux-pro-max overrides)

Source of truth when **ui-ux-pro-max** search conflicts with Pump. Always read **`pump-tma-design-system`** and **`pump-tma-ui-ux`** first; use this file to map research → implementation.

## Product context

- BSC meme launchpad, **corporate fintech terminal** (not consumer/playful bento landing).
- Sector refs: pump.fun density, Coinbase/Robinhood wallet patterns, DexScreener dark surfaces.
- **No shadcn/MUI.** Tokens: `pump-*`, components: `globals.css` `@layer components`.

## ui-ux-pro-max workflow (mandatory for agents)

1. **Search UX first** (not full `--design-system` colors for wallet/actions):
   ```powershell
   python .cursor/skills/ui-ux-pro-max/scripts/search.py "<topic>" --domain ux -n 6
   ```
2. **Design system with dials** only when exploring page-level tone:
   ```powershell
   python .cursor/skills/ui-ux-pro-max/scripts/search.py "fintech trading terminal dark" --design-system --density 8 --motion 3 -p "Pump" -f markdown
   ```
3. **Map output → Pump** — ignore generic hex, Inter/Lucide/Heroicons from skill output.
4. **Check page override** — `.cursor/design-system/pages/<page>.md` if it exists.
5. **grep existing CSS** in `apps/web/src/app/globals.css` before inventing new patterns.

## Anti-patterns (learned — do not repeat)

| ui-ux-pro-max / generic | Pump instead |
|-------------------------|--------------|
| Bento / block-based **large action cards** | **Segmented compact bar** (~44px height) |
| 4-column Deposit/Receive/Send grid with heavy borders | 3 actions max; single strip border |
| `--density` low + marketing hero patterns on wallet UI | Data-dense terminal; balance hero + compact action pills |
| `--text-label` uppercase on wallet CTAs | Sentence case `--text-caption` on Deposit/Withdraw/Create |
| `$` prefix on token symbols in UI | Show `symbol` only (e.g. `USDC`, not `$USDC`) |
| Circle crop on token/chain logos | **`TokenAvatar` default `rounded` (square tile)**; **user avatars only = circle** |
| Ad-hoc avatar/logo/icon px (14/18/22…) | **`size-theme.css` + `@/lib/ui-sizes` roles only** |
| Skill color palette (#F59E0B, purple accent, etc.) | `pump-accent`, `pump-card-soft`, `pump-border` |
| Phosphor / Lucide icons | `PumpIcon` + Material Symbols (`@/lib/pump-icons`) |
| Icon sizing via `width/height` only on `.material-symbols-rounded` | Set **`font-size` + `1em`** — else glyphs clip |

## Agent defaults (no user repeat needed)

On **every UI/UX task** in this repo — without the user asking again:

0. Read **`.cursor/design-system/designs.md`** (corporate fintech bar — permanent) + **typography-theme.css** (CDS roles).
1. Read **`pump-tma-design-system`** → **`pump-tma-ui-ux`** → **`.cursor/design-system/MASTER.md`** (+ `pages/<route>.md`).
2. Run **`ui-ux-pro-max`** `--domain ux` search when changing portfolio, wallet, nav, or earnings surfaces.
3. Apply **logo shape rule**, **no `$` on symbols**, **sentence-case wallet CTAs**, **Launched = Holdings grid parity**.
4. Sheets/modals: also read **`pages/sheets.md`**.
5. Typography: use `--type-*` / `.type-*` — never invent raw `font-size` px.

## Touch & density defaults

- Primary tap targets: **≥ 44px** (`min-height: 2.75rem`).
- Adjacent targets: **≥ 8px** gap OR inset dividers in one bar.
- Trading/portfolio surfaces: prefer **`--density 7–9`**, **`--motion 3`** (subtle).
- Motion: 100–150ms; respect `prefers-reduced-motion`.

## Icons (Material Symbols)

```css
/* Correct small icon — font-size drives glyph box */
.pump-icon-sm.material-symbols-rounded {
  font-size: 0.875rem !important;
  width: 1em !important;
  height: 1em !important;
  overflow: visible;
}
```

Never set `width/height` in px on Material Symbols without matching `font-size`.

## When to use 21st.dev

- Inspiration / layout reference only — adapt to Pump tokens.
- Do not `21st add shadcn/*` into repo without mapping to `globals.css` classes.
