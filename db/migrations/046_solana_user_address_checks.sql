-- Solana base58 wallet addresses on user-facing tables (case-sensitive).
-- EVM oauth/telegram wallet tables keep lowercase 0x checks.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_address_check;

ALTER TABLE creator_follows DROP CONSTRAINT IF EXISTS creator_follows_creator_address_check;
ALTER TABLE creator_follows DROP CONSTRAINT IF EXISTS creator_follows_follower_address_check;

ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_address_check;
ALTER TABLE push_preferences DROP CONSTRAINT IF EXISTS push_preferences_user_address_check;

ALTER TABLE token_favorites DROP CONSTRAINT IF EXISTS token_favorites_user_address_check;

ALTER TABLE airdrop_saves DROP CONSTRAINT IF EXISTS airdrop_saves_user_address_check;
ALTER TABLE airdrop_participants DROP CONSTRAINT IF EXISTS airdrop_participants_address_check;
ALTER TABLE airdrop_allocations DROP CONSTRAINT IF EXISTS airdrop_allocations_address_check;
ALTER TABLE airdrop_task_completions DROP CONSTRAINT IF EXISTS airdrop_task_completions_address_check;

ALTER TABLE launchpad_user_daily_completions DROP CONSTRAINT IF EXISTS launchpad_user_daily_completions_address_check;
ALTER TABLE launchpad_user_task_completions DROP CONSTRAINT IF EXISTS launchpad_user_task_completions_address_check;
ALTER TABLE launchpad_points_sync_log DROP CONSTRAINT IF EXISTS launchpad_points_sync_log_address_check;

ALTER TABLE points_audit_log DROP CONSTRAINT IF EXISTS points_audit_log_address_check;
ALTER TABLE user_volumes DROP CONSTRAINT IF EXISTS user_volumes_address_check;

ALTER TABLE referrer_fee_claims DROP CONSTRAINT IF EXISTS referrer_fee_claims_referrer_address_check;
ALTER TABLE deep_links DROP CONSTRAINT IF EXISTS deep_links_referrer_address_check;

ALTER TABLE kol_profiles DROP CONSTRAINT IF EXISTS kol_profiles_address_check;

ALTER TABLE user_trade_stats DROP CONSTRAINT IF EXISTS user_trade_stats_address_check;
ALTER TABLE user_hold_stats DROP CONSTRAINT IF EXISTS user_hold_stats_address_check;
ALTER TABLE user_position_lots DROP CONSTRAINT IF EXISTS user_position_lots_address_check;

COMMENT ON TABLE users IS 'User profiles keyed by wallet address (base58 Solana or 0x lowercase EVM).';
