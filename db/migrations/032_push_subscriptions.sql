-- Web Push subscriptions (PWA — desktop / Android / iOS Home Screen)
-- Wallet-scoped like token_favorites / airdrop_saves; endpoint is globally unique per browser install.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_address text NOT NULL,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown',
  display_mode text NOT NULL DEFAULT 'browser',
  user_agent_hash text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  last_error_at timestamptz,
  last_error_code integer,
  CONSTRAINT push_subscriptions_user_address_check CHECK (user_address = lower(user_address)),
  CONSTRAINT push_subscriptions_endpoint_len_check CHECK (char_length(endpoint) <= 2048),
  CONSTRAINT push_subscriptions_p256dh_len_check CHECK (char_length(p256dh_key) BETWEEN 80 AND 256),
  CONSTRAINT push_subscriptions_auth_len_check CHECK (char_length(auth_key) BETWEEN 20 AND 64),
  CONSTRAINT push_subscriptions_platform_check CHECK (
    platform = ANY (ARRAY['desktop'::text, 'android'::text, 'ios'::text, 'unknown'::text])
  ),
  CONSTRAINT push_subscriptions_display_mode_check CHECK (
    display_mode = ANY (ARRAY['standalone'::text, 'browser'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_enabled
  ON public.push_subscriptions (user_address, updated_at DESC)
  WHERE enabled = true;

CREATE TABLE IF NOT EXISTS public.push_preferences (
  user_address text PRIMARY KEY,
  airdrop_updates boolean NOT NULL DEFAULT true,
  trade_alerts boolean NOT NULL DEFAULT true,
  favorite_moves boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_preferences_user_address_check CHECK (user_address = lower(user_address))
);

-- Admin wipe — include push tables (before users truncate; FK none, but order-safe)
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
    public.push_subscriptions,
    public.push_preferences,
    public.trades,
    public.token_candles,
    public.token_favorites,
    public.token_media,
    public.user_positions,
    public.user_volumes,
    public.tokens,
    public.users,
    public.telegram_wallets,
    public.oauth_wallets,
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
