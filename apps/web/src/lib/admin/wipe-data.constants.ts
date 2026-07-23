/** Client-safe wipe copy — no DB / fs imports (admin Vite bundle). */

export const WIPE_DATA_CONFIRMATION_PHRASE = "WIPE PUMP DATA";

/** Tables / definitions intentionally kept after wipe. */
export const WIPE_PRESERVED_TABLES = [
  "contract_registry (program addresses from .env)",
  "launchpad_tasks (mission definitions + promoted campaigns)",
  "platform_settings",
  "admin_todos",
  "native SOL/USD price cache (Redis)",
] as const;

/** Human-readable wipe scope shown in admin Environment card. */
export const WIPE_TRUNCATED_TABLES = [
  "users · wallets (telegram / oauth / email / solana)",
  "XP · points · perks · mission completions",
  "weekly XP leaderboards (PG + Redis ZSET)",
  "clans · clan members · season settlement history",
  "airdrops · participants · claims · leaderboard",
  "tokens · trades · positions · candles · bonding",
  "KOL profiles · creator follows · push subscriptions",
  "referrals · fee claims · favorites · announcements",
  "Redis hot cache (tape/candles/streams) + CH trades/candles",
  "indexer cursor (re-seeded from indexer-sol .env)",
] as const;
