---
name: pump-tma-admin-console
description: >-
  Enterprise admin console for pump-tma: information architecture, microcopy,
  layout patterns, and component usage. Use for admin-console UI, AdminPanel,
  AdminChrome, ops copy, and internal tools styling.
---

# Pump Admin Console

Internal ops console (Vite `admin-console/` + shared `src/components/admin/`). **Not** the consumer Pump UI — browser wallet (injected) is allowed here only.

## Cursor UI skills (external references)

Use these when extending admin UI:

| Skill / pattern | Source | Use for |
|-----------------|--------|---------|
| **Token-first rules** | `.cursor/rules` + `pump-tma-design-system` | Colors, spacing, typography |
| **ui-design-brain** | [github.com/carmahhawwari/ui-design-brain](https://github.com/carmahhawwari/ui-design-brain) | Component best practices, anti-patterns |
| **ui-design-system** | [aussiegingersnap/cursor-skills](https://github.com/aussiegingersnap/cursor-skills) | Linear/Notion-style density |
| **Plan → Agent** | Developer Toolkit / Lopez 2026 | Plan layout + tokens before coding |
| **Design QA rhythm** | JohnnyC 2026 | Empty/loading/error/disabled states on every surface |

**Do not** prompt “make it beautiful.” Specify: tokens from `admin.css`, copy from `src/lib/admin/copy.ts`, layout from this skill.

## Information architecture

```
Sidebar (256px, grouped)
├── Overview
│   └── Dashboard          — KPIs, infra health, activity snapshot
├── Operations
│   ├── Portfolio          — Admin wallet holdings & liquidation
│   ├── Airdrop recovery   — Escrow sweep queue
│   └── Promo campaigns    — Off-chain points tasks
├── Finance
│   └── Treasury & fees    — Protocol fees, balances, withdrawals
└── System
    └── Contract registry  — UUPS proxy addresses
```

Top bar: breadcrumb `Operations › {page}` · page title · one-line purpose · **Refresh** · **Sign out**.

## Layout layers (Stripe / internal-tools pattern)

1. **KPI strip** — 4 cards max above fold on Dashboard
2. **Status / callout** — infra health or actionable alerts
3. **Two-column cards** — related KV groups (activity | fees)
4. **Full-width tables** — lists with filters/actions in card header

CSS: `admin-layout`, `admin-kpi-grid`, `admin-content-grid--2`, `admin-card`, `admin-section-desc`.

## Microcopy rules

| Rule | Example |
|------|---------|
| Sentence case headings | “Treasury balances” not “TREASURY BALANCES” |
| Buttons = verb + object | “Update fee”, “Run health check”, “Sign out” — not “Edit” alone |
| KPI label = metric name | “Registered users” |
| KPI hint = context | “+12 in last 24h · 840 with ≥1 trade” |
| Empty = problem + next step | “No campaigns in queue. New airdrops appear after launch.” |
| Danger = consequence | “Sweep all BNB — permanently halts curve trading.” |
| Status badges | Healthy · Degraded · Unavailable (not “ok”) |
| Numbers | `.admin-num` tabular mono |
| On-chain refs | Short address + explorer link |

**Source of truth:** `src/lib/admin/copy.ts` — never invent copy in components.

## Components (`AdminChrome.tsx`)

| Component | Use |
|-----------|-----|
| `AdminLayout` | Shell: sidebar + topbar + content |
| `AdminSection` | Card with title, description, actions |
| `AdminKpiCard` | Dashboard metrics |
| `AdminStatusBadge` | Health / sweep status |
| `AdminBtn` | `primary` CTA · `danger` destructive · `ghost` secondary |
| `AdminDataTable` | Settings KV rows (label · value · action) |
| `AdminGridTable` | Multi-row data (airdrops, promo list) |
| `AdminCallout` | Info / warning banner inside a section |
| `AdminEmpty` | Centered empty state |

## Files

```
admin-console/src/          — Vite app, injected wagmi only
src/components/admin/       — Shared UI (AdminPanel, AdminChrome, …)
src/lib/admin/copy.ts       — All microcopy
src/app/admin/admin.css     — Admin-only styles (imported by admin-console)
```

## Do NOT

- Use consumer Pump wallet / Telegram auth in admin console
- Import `@/lib/wagmi` (kernel) in admin-console — use `admin-console/src/wagmi.ts`
- Add dead UI (placeholder search without implementation)
- Spreadsheet-style full cell borders or Excel tabs
- Casual copy (“stuff”, “etc.”, “…” as button label)

## Verify

```bash
cd admin-console && npm run build
```

Check: sidebar groups, KPI hints, section descriptions, empty states, danger confirmations.
