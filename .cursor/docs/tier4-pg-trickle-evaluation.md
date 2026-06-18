# Tier 4 — PostgreSQL 18 + pg_trickle IVM

**Durum:** Değerlendirme / VM PG sürümü yükselince.

## Hedef

Materialized view refresh CPU'sunu −%80; board stats MV reconcile yerine incremental IVM.

## Ön koşullar

- PostgreSQL **18+** (VM şu an PG 16)
- `pg_trickle` extension ([pgxn](https://pgxn.org/dist/pg_trickle/))
- Yeterli RAM (IVM metadata + WAL)

## Aday MV'ler

| MV | Okuyucu | Incremental alternatif |
|----|---------|------------------------|
| `mv_token_trade_stats` | Arena movers (legacy) | `token_board_stats` ✅ zaten incremental |
| Price anchor MVs | 24h change | `token_board_stats` rolling reconcile |

## Geçiş planı (özet)

1. Staging VM'de PG 18 + `pg_trickle` kurulumu
2. Tek MV pilot (en yüksek refresh maliyeti)
3. `MV_REFRESH_ENABLED=false` + IVM reconcile job
4. Prod cutover penceresi

## Bugün

`INCREMENTAL_BOARD_STATS=true` + nightly `reconcileBoardStatsRollingWindows` Tier 3'te yeterli tek VM için.
