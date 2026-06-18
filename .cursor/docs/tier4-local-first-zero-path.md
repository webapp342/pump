# Tier 4 — Local-first reads (Zero yolu)

Rocicorp Zero tam entegrasyonu ayrı servis + schema sync gerektirir. Tier 4 **bugün** şunu uygular:

## Uygulanan (local-first)

| Veri | Store | 0ms okuma |
|------|-------|-----------|
| Favorites | `localStorage` `pump:lf:favorites:{addr}` | ✅ mount |
| Portfolio snapshot | `localStorage` `pump:lf:portfolio:{addr}` | ✅ mount |
| Bonding curve quotes | `useBondingCurveMachine` + WS delta | ✅ trade panel |

Env: `NEXT_PUBLIC_LOCAL_FIRST_READS=true` (default on)

## Tam Zero'ya geçiş (gelecek)

1. Zero cache server (Rocicorp) + Postgres logical replication veya custom mutator
2. Schema: `favorites`, `user_positions`, `portfolio` partial sync
3. Client `@rocicorp/zero` — query-driven sync
4. Next.js SSR → Zero preload veya mevcut PPR + Zero hydrate

## Sözleşme

- Local store **stale-while-revalidate**: API/bootstrap arka planda doğrular
- Writes (toggle favorite) optimistic + API reconcile
- Bonding machine: WS → local; chain `curves()` drift > %2 → chain kazanır
