# Sheets & modals — chrome contract

Source of truth for mobile bottom sheets and centered desktop cards. Implements with `AppBottomSheet` + `.app-bottom-sheet__*` in `globals.css`. Aligns with Coinbase CDS / Robinhood wallet density, not marketing heroes.

## Anatomy (fixed order)

1. **Grip** (mobile only) — centered 36×4px bar
2. **Header** — horizontal flex row, always
   - Left: optional back + title stack (title + optional subtitle)
   - Right: **Close (X)** — top-right, ≥44×44px hit target
3. **Body** — 16px horizontal padding, 16px section gap (4px grid)
4. **Footer** (optional) — safe-area bottom padding; primary CTA full-width on mobile

## Typography

| Role | Token | Notes |
|------|-------|--------|
| Sheet title | `--text-h3` | Never page `--text-h1` / display |
| Subtitle | `--text-caption` + `--pump-muted` | One short sentence max |
| Field labels | `--text-label` uppercase OR sentence `--text-body-sm` weight medium — pick one system per surface and keep it |
| Body | `--text-body-sm` | |

Do **not** rely on `.modal-sheet-panel h2` alone — it fights sheet density. Prefer `.app-bottom-sheet__title` / `.app-sheet__title`.

## Spacing

- Header padding: `8px 16px 14px` (grip already adds top)
- Body padding: `0 16px 16px`
- Section stack gap: `16–20px`
- Adjacent field label → input: `6–8px`
- Footer actions: equal-width split or single full-width primary

## Anti-patterns (do not ship)

| Bad | Why |
|-----|-----|
| Close under subtitle / left column | Chrome row missing `display:flex` — X falls into document flow |
| Custom header without wrapping grid/flex | Classes like `profile-editor-modal__header` never applied |
| Oversized titles (H1/H2 clamp) | Feels amateur; steals space from form |
| Floating Save button bottom-right only | Unbalanced on mobile — use full-width |
| Mixing `app-sheet__*` parent styles with unstyled `app-bottom-sheet__header` | Layout collapses |

## Component API

Prefer default chrome:

```tsx
<AppBottomSheet
  open={open}
  onClose={onClose}
  ariaLabel="Withdraw"
  title="Withdraw"
  subtitle="Send assets to an external wallet address."
  headerLeading={showBack ? <BackButton /> : null}
>
  {children}
</AppBottomSheet>
```

Custom `header` must still be a **single row/grid** that includes close on the right (or set `hideCloseButton` and provide an equivalent).

## Related files

- `apps/web/src/components/ui/AppBottomSheet.tsx`
- `apps/web/src/app/globals.css` — `.app-bottom-sheet__*`
- Consumers: wallet funding, profile editor, **Settings** (`AccountSheet`), sign-in, claims, share, create choice, etc.

## Mobile Settings (`AccountSheet`)

Title **Settings**. Body is settings rows only — no balance, address, or Deposit/Withdraw (those stay on Portfolio). See `designs.md` → Mobile Settings sheet.

## Mobile Create (`CreateChoiceSheet`)

Same list chrome as Settings: full-bleed dividers, `1rem` gutter, icon + label/desc + chevron. No option cards.

## Mobile Deposit / Withdraw (`WalletFundingModal`)

No boxed fields. Full-bleed dividers; borderless inputs in `1rem` gutter. Deposit Done + Withdraw Cancel/Submit live in sheet footer.
