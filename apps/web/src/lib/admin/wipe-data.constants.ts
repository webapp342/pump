/** Client-safe wipe copy — no DB / fs imports (admin Vite bundle). */

export const WIPE_DATA_CONFIRMATION_PHRASE = "WIPE PUMP DATA";

export const WIPE_PRESERVED_TABLES = [
  "contract_registry",
  "launchpad_tasks",
  "platform_settings",
  "admin_todos",
] as const;

export const WIPE_TRUNCATED_TABLES = [
  "users",
  "tokens",
  "trades",
  "airdrops",
  "bonding_states",
  "user_positions",
  "indexer_state",
  "telegram_wallets",
  "oauth_wallets",
  "email_wallets",
  "…and related airdrop / points / referral rows",
] as const;
