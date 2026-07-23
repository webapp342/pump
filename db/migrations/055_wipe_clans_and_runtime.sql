-- Extend admin wipe: clans + season settlement history (user/runtime data).
-- Preserves launchpad_tasks, contract_registry, platform_settings, admin_todos.

CREATE OR REPLACE FUNCTION public.wipe_launchpad_app_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wipe_tables text[] := ARRAY[
    'airdrop_task_completions',
    'airdrop_saves',
    'airdrop_claims',
    'airdrop_allocations',
    'airdrop_participants',
    'airdrop_social_tasks',
    'airdrops',
    'points_inventory',
    'points_redemptions',
    'points_audit_log',
    'launchpad_user_daily_completions',
    'launchpad_user_task_completions',
    'launchpad_points_sync_log',
    'referral_invite_xp_claims',
    'user_trade_stats',
    'user_hold_stats',
    'user_position_lots',
    'referrer_network_stats',
    'user_volumes',
    'king_history',
    'token_board_stats',
    'kol_callout_requests',
    'kol_profiles',
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
    'clan_members',
    'clans',
    'season_settlement_runs',
    'token_candles',
    'trades',
    'user_positions',
    'bonding_states',
    'tokens',
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
  'Admin clean-start: users/wallets/XP/clans/trades/tokens/leaderboards. Keeps mission defs + registry + settings.';
