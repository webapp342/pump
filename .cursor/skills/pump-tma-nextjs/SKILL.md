---
name: pump-tma-nextjs
description: >-
  Next.js App Router patterns used in pump-tma: server pages, client islands,
  API routes, PostgreSQL data layer, loading states. Use when adding routes,
  API endpoints, server components, or data fetching in this repo.
---

# Pump TMA — Next.js Patterns

## Stack

- Next.js **16** App Router, React **19**, TypeScript
- Output: `standalone` (`next.config.ts`)
- Path alias: `@/` → `src/`

## Page architecture

```
src/app/<route>/page.tsx     → Server Component (default)
src/components/**/**Client.tsx → Client Component ("use client")
src/app/<route>/loading.tsx  → Route skeleton inside AppShell
```

**Pattern**: thin server `page.tsx` imports `*Client` or `*Shell` for interactivity.

```tsx
// page.tsx — server
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailClient id={id} />;
}
```

- No `"use client"` in `src/app/` pages (current convention)
- Wrap pages with `AppShell` (or domain shell like `TokenDetailShell`)

## API routes

Location: `src/app/api/**/route.ts`

```ts
export async function GET() {
  try {
    const data = await someDbFn();
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- Response shape: `{ data }` on success, `{ error }` on failure
- Normalize addresses via `normalizeAddressParam` from `src/lib/address.ts`
- Business logic in `src/lib/` — routes stay thin

## Database

- **PostgreSQL** via `pg` Pool — singleton per module (`getLaunchpadPool()` in `src/lib/db/launchpad.ts`)
- Domain modules: `src/lib/db/launchpad.ts`, `airdrops.ts`, `users.ts`, `admin.ts`, etc.
- Env: `LAUNCHPAD_DATABASE_URL`
- Migrations: `db/migrations/`, schema in `schema.sql`
- Optional: `user-postgres-zug` MCP for read-only inspection (never mutate prod from agent)

## Providers (root layout)

`src/app/layout.tsx` nests: `ThemeProvider` → `Web3Provider` → feature providers → `{children}`.

Do not add providers inside individual pages unless scoped (e.g. admin).

## Config & security

- CSP in `next.config.ts` — self-hosted scripts only
- Turbopack root pinned to project directory
- Env vars: `NEXT_PUBLIC_*` for client; secrets server-only

## Related packages

| Concern | Location |
|---------|----------|
| Fonts | `src/lib/fonts.ts` (Inter + IBM Plex Mono) |
| Nav items | `src/lib/nav-config.ts` |
| Perf flags | `src/lib/db/perf-flags.ts` |
| Realtime | separate `realtime/` + `indexer/` services |

## Adding a feature checklist

1. DB query in `src/lib/db/<domain>.ts`
2. API route in `src/app/api/<domain>/route.ts`
3. Client hook or fetch in `*Client.tsx`
4. `loading.tsx` skeleton if route is slow
5. Type exported from db module, reused in components

## Docs lookup

Use `research-verified` skill — Context7 library `/vercel/next.js` for App Router APIs.
