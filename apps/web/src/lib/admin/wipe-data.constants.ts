/** Client-safe wipe copy — no DB / fs imports (admin Vite bundle). */

export const WIPE_DATA_CONFIRMATION_PHRASE = "WIPE PUMP DATA";

/** Tables / definitions intentionally kept after wipe. */
export const WIPE_PRESERVED_TABLES = [
  "contract_registry",
  "launchpad_tasks (promoted campaigns + system missions)",
  "platform_settings",
  "admin_todos",
] as const;

/** Human-readable wipe scope shown in admin Environment card. */
export const WIPE_TRUNCATED_TABLES = [
  "users (XP / points / lifetime)",
  "points_audit_log · points_inventory · points_redemptions (perks)",
  "launchpad_user_*_completions (finished challenges)",
  "referral_invite_xp_claims · referral_bindings",
  "airdrops + allocations / claims / participants (leaderboard)",
  "user_trade_stats · user_volumes · king_history (rewards leaderboard)",
  "tokens · trades · positions · candles · wallets",
  "indexer_state (re-seeded from Indexer .env)",
] as const;
