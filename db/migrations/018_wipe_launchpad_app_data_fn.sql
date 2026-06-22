-- Safe app-data wipe callable by pump_app (admin console). Schema + preserved tables stay.
-- Run: sudo -u postgres psql -d pump_db -f db/migrations/018_wipe_launchpad_app_data_fn.sql
--
-- Preserved: contract_registry, launchpad_tasks, platform_settings, admin_todos
-- Indexer cursor: seeded post-wipe from Indexer .env (INDEXER_START_BLOCK) via admin API.

CREATE OR REPLACE FUNCTION public.wipe_launchpad_app_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE
    public.airdrop_task_completions,
    public.airdrop_saves,
    public.airdrop_claims,
    public.airdrop_allocations,
    public.airdrop_participants,
    public.airdrop_social_tasks,
    public.airdrops,
    public.bonding_states,
    public.creator_fee_claims,
    public.referrer_fee_claims,
    public.referral_bindings,
    public.creator_follows,
    public.deep_links,
    public.king_history,
    public.launchpad_points_sync_log,
    public.launchpad_user_daily_completions,
    public.launchpad_user_task_completions,
    public.points_audit_log,
    public.trades,
    public.token_favorites,
    public.token_media,
    public.user_positions,
    public.user_volumes,
    public.tokens,
    public.users,
    public.telegram_wallets,
    public.email_wallets,
    public.indexer_state
  RESTART IDENTITY CASCADE;

  REFRESH MATERIALIZED VIEW public.mv_token_trade_stats;
  REFRESH MATERIALIZED VIEW public.mv_token_price_anchors;

  RETURN jsonb_build_object(
    'ok', true,
    'preserved', jsonb_build_array(
      'contract_registry',
      'launchpad_tasks',
      'platform_settings',
      'admin_todos'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wipe_launchpad_app_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wipe_launchpad_app_data() TO pump_app;
