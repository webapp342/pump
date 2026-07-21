-- Comprehensive admin wipe for clean-start (Solana era).
-- Wipes: users/XP, mission completions, perks inventory, referral XP claims,
--        airdrop progress + campaigns, rewards/KOL leaderboard rollups, trades/tokens.
-- Preserves: contract_registry, launchpad_tasks (promoted campaigns + system missions),
--            platform_settings, admin_todos.
--
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/052_wipe_launchpad_app_data_comprehensive.sql

CREATE OR REPLACE FUNCTION public.wipe_launchpad_app_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Child → parent order not required with CASCADE; existence-checked for older DBs.
  wipe_tables text[] := ARRAY[
    -- Airdrops (campaigns + leaderboard / progress)
    'airdrop_task_completions',
    'airdrop_saves',
    'airdrop_claims',
    'airdrop_allocations',
    'airdrop_participants',
    'airdrop_social_tasks',
    'airdrops',
    -- Rewards / XP / perks / challenge progress
    'points_inventory',
    'points_redemptions',
    'points_audit_log',
    'launchpad_user_daily_completions',
    'launchpad_user_task_completions',
    'launchpad_points_sync_log',
    'referral_invite_xp_claims',
    -- Leaderboard / stats rollups
    'user_trade_stats',
    'user_hold_stats',
    'user_position_lots',
    'referrer_network_stats',
    'user_volumes',
    'king_history',
    'token_board_stats',
    -- KOL marketplace user rows
    'kol_callout_requests',
    'kol_profiles',
    -- Social / push / fees / referrals
    'push_subscriptions',
    'push_preferences',
    'creator_follows',
    'creator_fee_claims',
    'referrer_fee_claims',
    'referral_bindings',
    'deep_links',
    'token_announcements',
    'token_favorites',
    'token_media',
    -- Trading / positions / candles
    'token_candles',
    'trades',
    'user_positions',
    'bonding_states',
    'tokens',
    -- Auth wallets + users (XP lives on users)
    'telegram_wallets',
    'oauth_wallets',
    'email_wallets',
    'solana_wallets',
    'users',
    'indexer_state'
  ];
  t text;
  existing text[] := ARRAY[]::text[];
  truncated text[] := ARRAY[]::text[];
  sql text;
BEGIN
  FOREACH t IN ARRAY wipe_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      existing := array_append(existing, format('public.%I', t));
      truncated := array_append(truncated, t);
    END IF;
  END LOOP;

  IF cardinality(existing) > 0 THEN
    sql := 'TRUNCATE TABLE ' || array_to_string(existing, ', ') || ' RESTART IDENTITY CASCADE';
    EXECUTE sql;
  END IF;

  IF to_regclass('public.mv_token_trade_stats') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_token_trade_stats;
  END IF;
  IF to_regclass('public.mv_token_price_anchors') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_token_price_anchors;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'preserved', jsonb_build_array(
      'contract_registry',
      'launchpad_tasks',
      'platform_settings',
      'admin_todos'
    ),
    'truncated', to_jsonb(truncated)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wipe_launchpad_app_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wipe_launchpad_app_data() TO pump_app;

COMMENT ON FUNCTION public.wipe_launchpad_app_data() IS
  'Admin clean-start wipe: users/XP/perks/completions/airdrops/leaderboards. Keeps launchpad_tasks + registry + settings + todos.';
