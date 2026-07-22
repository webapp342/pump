# Redis Key Catalog — Pump Güncelleme

**Owner:** Platform · **Updated:** F1

## Weekly XP (hot path — SSOT)

| Key | Type | Writer | Reader | TTL |
|-----|------|--------|--------|-----|
| `weekly_user_xp` | ZSET | indexer, missions API | `/api/xp/weekly`, TradePanel | none (season cron RENAME) |
| `weekly_clan_xp` | ZSET | indexer, missions API | `/api/leaderboard/weekly` | none |
| `weekly_user_xp_season_{N}` | ZSET | season cron RENAME | settlement worker | archive |
| `weekly_clan_xp_season_{N}` | ZSET | season cron RENAME | settlement worker | archive |

## Season meta

| Key | Type | Writer | Reader |
|-----|------|--------|--------|
| `season:current` | HASH `{id, started_at}` | season cron, bootstrap | all services |
| `season:{N}:claims_open` | STRING `true/false` | settlement worker | claim UI |

## Realtime (existing)

| Key | Type | Writer | Reader |
|-----|------|--------|--------|
| `pump:trade:{token}` | PUBSUB | indexer | realtime WS |
| `pump:stream:{room}` | STREAM | indexer | realtime replay |
| `pump:seq:trade:{token}` | STRING | indexer | WS ordering |

## ClickHouse buffer (F2)

| Key | Type | Writer | Reader |
|-----|------|--------|--------|
| `pump:ch:trades` | STREAM | indexer | ch-flusher |
| `pump:ch:candles` | STREAM | indexer | ch-flusher |

Consumer group: `ch-flusher` · ACK after CH insert with `async_insert=1, wait_for_async_insert=1`.

## Price cache (F7)

| Key | Type | Writer | Reader |
|-----|------|--------|--------|
| `price:native:sol:usd` | STRING JSON | price-worker | web `/api/bnb-price`, indexer |

## Clan lookup cache (optional)

| Key | Type | Writer | Reader |
|-----|------|--------|--------|
| `clan:member:{wallet}` | STRING clan_id | clan API | indexer ZINCRBY |

## Season RENAME rules (guncelleme3)

```text
Pazar 23:59:59 UTC:
  RENAME weekly_user_xp → weekly_user_xp_season_{id}
  RENAME weekly_clan_xp → weekly_clan_xp_season_{id}
  ZADD weekly_user_xp / weekly_clan_xp (empty — implicit on first ZINCRBY)
  HINCRBY season:current id 1
  HSET season:current started_at {iso}
```

**Never DEL** active season keys — use RENAME only.

## Feature flags (env)

| Flag | Default | Effect |
|------|---------|--------|
| `USE_REDIS_WEEKLY_XP` | false dev / true prod | Indexer ZINCRBY + weekly APIs |
| `CLICKHOUSE_VIA_REDIS_STREAM` | false → true F2 | Indexer XADD instead of direct CH HTTP |
| `SKIP_PG_TOKEN_CANDLES` | false | F6 — stop PG candle mirror |
