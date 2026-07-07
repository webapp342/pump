--
-- PostgreSQL database dump
--

\restrict 6MRwp4avbUH99PHaR2MwpERig6ZtyP5PJ9wLIXT0cmYA5qiMObzwd9w0ykMFqbQ

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: gap_fill_candles(text, text, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gap_fill_candles(p_token_address text, p_interval text, p_limit integer DEFAULT 1000, p_end_ts timestamp with time zone DEFAULT now()) RETURNS TABLE(bucket_sec bigint, open_zug numeric, high_zug numeric, low_zug numeric, close_zug numeric, volume_zug numeric, buy_volume_zug numeric, trade_count integer)
    LANGUAGE sql STABLE
    AS $$
  WITH interval_secs AS (
    SELECT CASE p_interval
      WHEN '15s' THEN 15
      WHEN '1m' THEN 60
      WHEN '5m' THEN 300
      WHEN '15m' THEN 900
      WHEN '1h' THEN 3600
      WHEN '4h' THEN 14400
      ELSE 60
    END AS secs
  ),
  stored AS (
    SELECT
      (EXTRACT(EPOCH FROM tc.bucket_ts))::bigint AS bucket_sec,
      tc.open_zug,
      tc.high_zug,
      tc.low_zug,
      tc.close_zug,
      tc.volume_zug,
      tc.buy_volume_zug,
      tc.trade_count
    FROM token_candles tc
    WHERE tc.token_address = lower(p_token_address)
      AND tc.candle_interval = p_interval
    ORDER BY tc.bucket_ts DESC
    LIMIT GREATEST(1, LEAST(p_limit, 4000))
  ),
  stored_asc AS (
    SELECT * FROM stored ORDER BY bucket_sec ASC
  ),
  bounds AS (
    SELECT
      (SELECT MIN(s.bucket_sec) FROM stored_asc s) AS start_sec,
      (SELECT MAX(s.bucket_sec) FROM stored_asc s) AS last_trade_sec,
      (SELECT secs FROM interval_secs) AS interval_sec
  ),
  end_bound AS (
    SELECT
      GREATEST(
        b.last_trade_sec,
        (EXTRACT(EPOCH FROM date_trunc('second', p_end_ts))::bigint / b.interval_sec) * b.interval_sec
      ) AS end_sec,
      b.start_sec,
      b.interval_sec
    FROM bounds b
  ),
  windowed AS (
    SELECT
      eb.start_sec,
      eb.end_sec,
      eb.interval_sec,
      GREATEST(
        eb.start_sec,
        eb.end_sec - (GREATEST(1, LEAST(p_limit, 4000)) - 1) * eb.interval_sec
      ) AS series_start_sec
    FROM end_bound eb
    WHERE eb.start_sec IS NOT NULL
  ),
  series AS (
    SELECT generate_series(w.series_start_sec, w.end_sec, w.interval_sec) AS bucket_sec
    FROM windowed w
  ),
  joined AS (
    SELECT
      s.bucket_sec,
      sa.open_zug AS raw_open,
      sa.high_zug AS raw_high,
      sa.low_zug AS raw_low,
      sa.close_zug AS raw_close,
      sa.volume_zug AS raw_volume,
      sa.buy_volume_zug AS raw_buy_volume,
      sa.trade_count AS raw_trade_count
    FROM series s
    LEFT JOIN stored_asc sa ON sa.bucket_sec = s.bucket_sec
  ),
  carried AS (
    SELECT
      j.bucket_sec,
      j.raw_open,
      j.raw_high,
      j.raw_low,
      j.raw_close,
      j.raw_volume,
      j.raw_buy_volume,
      j.raw_trade_count,
      MAX(j.raw_close) FILTER (WHERE j.raw_close IS NOT NULL AND j.raw_close > 0)
        OVER (ORDER BY j.bucket_sec ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS last_close
    FROM joined j
  )
  SELECT
    c.bucket_sec,
    COALESCE(c.raw_open, c.last_close) AS open_zug,
    COALESCE(c.raw_high, c.last_close) AS high_zug,
    COALESCE(c.raw_low, c.last_close) AS low_zug,
    COALESCE(c.raw_close, c.last_close) AS close_zug,
    COALESCE(c.raw_volume, 0) AS volume_zug,
    COALESCE(c.raw_buy_volume, 0) AS buy_volume_zug,
    COALESCE(c.raw_trade_count, 0)::integer AS trade_count
  FROM carried c
  WHERE c.last_close IS NOT NULL AND c.last_close > 0
  ORDER BY c.bucket_sec ASC;
$$;


--
-- Name: launchpad_award_points(text, text, text, text, date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.launchpad_award_points(p_address text, p_task_key text, p_event_id text, p_tx_hash text DEFAULT NULL::text, p_completed_date date DEFAULT NULL::date, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(status text, points_awarded integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_address text := lower(p_address);
  v_task launchpad_tasks%ROWTYPE;
  v_multiplier numeric;
  v_points integer;
  v_tx_hash text;
  v_completion_row_count integer := 0;
  v_sync_id bigint;
  v_existing_status text;
  v_existing_points integer;
BEGIN
  IF v_address IS NULL OR v_address = '' THEN RAISE EXCEPTION 'address is required'; END IF;
  IF p_task_key IS NULL OR p_task_key = '' THEN RAISE EXCEPTION 'task_key is required'; END IF;
  IF p_event_id IS NULL OR p_event_id = '' THEN RAISE EXCEPTION 'event_id is required'; END IF;

  SELECT * INTO v_task FROM launchpad_tasks WHERE task_key = p_task_key;
  IF NOT FOUND OR v_task.is_active = false THEN
    status := 'SKIPPED'; points_awarded := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT lps.status, lps.points_awarded INTO v_existing_status, v_existing_points
  FROM launchpad_points_sync_log lps WHERE lps.event_id = p_event_id LIMIT 1;
  IF FOUND THEN status := v_existing_status; points_awarded := COALESCE(v_existing_points, 0); RETURN NEXT; RETURN; END IF;

  INSERT INTO users (address, last_active) VALUES (v_address, now())
  ON CONFLICT (address) DO UPDATE SET last_active = EXCLUDED.last_active;

  SELECT COALESCE(multiplier, 1.0) INTO v_multiplier FROM users WHERE address = v_address;
  v_points := floor(v_task.reward_points * v_multiplier)::integer;
  v_tx_hash := COALESCE(NULLIF(p_tx_hash, ''), 'launchpad:' || p_event_id);

  INSERT INTO launchpad_points_sync_log (address, task_key, event_id, tx_hash, points_awarded, status, attempts, metadata)
  VALUES (v_address, p_task_key, p_event_id, v_tx_hash, v_points, 'PENDING', 1, p_metadata)
  RETURNING id INTO v_sync_id;

  IF v_task.task_kind = 'DAILY' THEN
    IF p_completed_date IS NULL THEN RAISE EXCEPTION 'completed_date required for daily tasks'; END IF;
    INSERT INTO launchpad_user_daily_completions (address, task_key, completed_date, source_tx_hash, source_event_id, points_awarded, metadata)
    VALUES (v_address, p_task_key, p_completed_date, v_tx_hash, p_event_id, v_points, p_metadata)
    ON CONFLICT (address, task_key, completed_date) DO NOTHING;
    GET DIAGNOSTICS v_completion_row_count = ROW_COUNT;
  ELSE
    INSERT INTO launchpad_user_task_completions (address, task_key, source_tx_hash, source_event_id, points_awarded, metadata)
    VALUES (v_address, p_task_key, v_tx_hash, p_event_id, v_points, p_metadata)
    ON CONFLICT (address, task_key) DO NOTHING;
    GET DIAGNOSTICS v_completion_row_count = ROW_COUNT;
  END IF;

  IF v_completion_row_count = 0 THEN
    UPDATE launchpad_points_sync_log SET status = 'SKIPPED', synced_at = now(),
      metadata = metadata || jsonb_build_object('skip_reason', 'already_completed') WHERE id = v_sync_id;
    status := 'SKIPPED'; points_awarded := 0; RETURN NEXT; RETURN;
  END IF;

  UPDATE users SET points = COALESCE(points, 0) + v_points, last_active = now() WHERE address = v_address;
  INSERT INTO points_audit_log (address, points_awarded, task_type, tx_hash, metadata)
  VALUES (v_address, v_points, p_task_key, v_tx_hash, p_metadata || jsonb_build_object('event_id', p_event_id));

  UPDATE launchpad_points_sync_log SET status = 'SYNCED', synced_at = now() WHERE id = v_sync_id;
  status := 'SYNCED'; points_awarded := v_points; RETURN NEXT;
END;
$$;


--
-- Name: launchpad_ensure_user(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.launchpad_ensure_user(p_address text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(out_address text, created boolean, telegram_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_address text := lower(p_address);
  v_row_count integer := 0;
  v_created boolean := false;
  v_telegram_id text;
BEGIN
  IF v_address IS NULL OR v_address = '' THEN
    RAISE EXCEPTION 'address is required';
  END IF;

  INSERT INTO users (address, last_active)
  VALUES (v_address, now())
  ON CONFLICT (address) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_created := (v_row_count > 0);

  UPDATE users SET last_active = now() WHERE users.address = v_address;

  SELECT users.telegram_id INTO v_telegram_id FROM users WHERE users.address = v_address;

  out_address := v_address;
  created := v_created;
  telegram_id := v_telegram_id;
  RETURN NEXT;
END;
$$;


--
-- Name: wipe_launchpad_app_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wipe_launchpad_app_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_todos (
    id bigint NOT NULL,
    title text NOT NULL,
    body text,
    priority text DEFAULT 'medium'::text NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT admin_todos_created_by_check CHECK (((created_by IS NULL) OR (created_by = lower(created_by)))),
    CONSTRAINT admin_todos_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT admin_todos_title_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: admin_todos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_todos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_todos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_todos_id_seq OWNED BY public.admin_todos.id;


--
-- Name: airdrop_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrop_allocations (
    id bigint NOT NULL,
    airdrop_id bigint NOT NULL,
    address text NOT NULL,
    rank integer NOT NULL,
    amount numeric(78,18) NOT NULL,
    proof_path jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT airdrop_allocations_address_check CHECK ((address = lower(address))),
    CONSTRAINT airdrop_allocations_rank_check CHECK ((rank > 0))
);


--
-- Name: airdrop_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.airdrop_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: airdrop_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.airdrop_allocations_id_seq OWNED BY public.airdrop_allocations.id;


--
-- Name: airdrop_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrop_claims (
    id bigint NOT NULL,
    airdrop_id bigint NOT NULL,
    claimant text NOT NULL,
    amount numeric(78,18) NOT NULL,
    tx_hash text NOT NULL,
    block_time timestamp with time zone NOT NULL,
    CONSTRAINT airdrop_claims_claimant_check CHECK ((claimant = lower(claimant)))
);


--
-- Name: airdrop_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.airdrop_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: airdrop_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.airdrop_claims_id_seq OWNED BY public.airdrop_claims.id;


--
-- Name: airdrop_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrop_participants (
    airdrop_id bigint NOT NULL,
    address text NOT NULL,
    social_gate_passed_at timestamp with time zone,
    first_onchain_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    social_tasks_total smallint DEFAULT 0 NOT NULL,
    social_tasks_completed smallint DEFAULT 0 NOT NULL,
    hold_met boolean DEFAULT false NOT NULL,
    buy_met boolean DEFAULT false NOT NULL,
    onchain_qualified boolean DEFAULT false NOT NULL,
    progress_pct smallint DEFAULT 0 NOT NULL,
    viewer_rank integer,
    claimable_amount numeric(78,18),
    claimed_at timestamp with time zone,
    CONSTRAINT airdrop_participants_address_check CHECK ((address = lower(address))),
    CONSTRAINT airdrop_participants_progress_pct_check CHECK (((progress_pct >= 0) AND (progress_pct <= 100)))
);


--
-- Name: airdrop_saves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrop_saves (
    user_address text NOT NULL,
    airdrop_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT airdrop_saves_user_address_check CHECK ((user_address = lower(user_address)))
);


--
-- Name: airdrop_social_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrop_social_tasks (
    id bigint NOT NULL,
    airdrop_id bigint NOT NULL,
    task_type text NOT NULL,
    target_url text NOT NULL,
    reward_points integer DEFAULT 0 NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: airdrop_social_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.airdrop_social_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: airdrop_social_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.airdrop_social_tasks_id_seq OWNED BY public.airdrop_social_tasks.id;


--
-- Name: airdrop_task_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrop_task_completions (
    id bigint NOT NULL,
    airdrop_id bigint NOT NULL,
    task_id bigint NOT NULL,
    address text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT airdrop_task_completions_address_check CHECK ((address = lower(address)))
);


--
-- Name: airdrop_task_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.airdrop_task_completions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: airdrop_task_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.airdrop_task_completions_id_seq OWNED BY public.airdrop_task_completions.id;


--
-- Name: airdrops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airdrops (
    id bigint NOT NULL,
    on_chain_id bigint,
    creator_address text NOT NULL,
    linked_token text NOT NULL,
    reward_token text,
    total_funded numeric(78,18) NOT NULL,
    total_allocated numeric(78,18),
    rules_json jsonb NOT NULL,
    rules_hash text NOT NULL,
    qualify_start timestamp with time zone NOT NULL,
    qualify_end timestamp with time zone NOT NULL,
    claim_start timestamp with time zone,
    claim_end timestamp with time zone,
    merkle_root text,
    status text NOT NULL,
    create_tx_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT airdrops_creator_address_check CHECK ((creator_address = lower(creator_address))),
    CONSTRAINT airdrops_linked_token_check CHECK ((linked_token = lower(linked_token))),
    CONSTRAINT airdrops_reward_token_check CHECK (((reward_token IS NULL) OR (reward_token = lower(reward_token))))
);


--
-- Name: airdrops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.airdrops_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: airdrops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.airdrops_id_seq OWNED BY public.airdrops.id;


--
-- Name: bonding_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bonding_states (
    token_address text NOT NULL,
    reserve_zug numeric(78,18) DEFAULT 0 NOT NULL,
    token_sold numeric(78,18) DEFAULT 0 NOT NULL,
    target_zug numeric(78,18) NOT NULL,
    progress_bps integer DEFAULT 0 NOT NULL,
    last_price_zug numeric(78,18) DEFAULT 0 NOT NULL,
    market_cap_zug numeric(78,18) DEFAULT 0 NOT NULL,
    holder_count integer DEFAULT 0 NOT NULL,
    trade_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    virtual_zug_reserve numeric(78,18) DEFAULT 5000 NOT NULL,
    virtual_token_reserve numeric(78,18) DEFAULT 1000000000 NOT NULL,
    CONSTRAINT bonding_states_progress_bps_check CHECK (((progress_bps >= 0) AND (progress_bps <= 10000)))
);


--
-- Name: COLUMN bonding_states.virtual_zug_reserve; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonding_states.virtual_zug_reserve IS 'Virtual BNB reserve (human units) at token registration';


--
-- Name: COLUMN bonding_states.virtual_token_reserve; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonding_states.virtual_token_reserve IS 'Virtual token reserve (human units) at token registration';


--
-- Name: contract_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_registry (
    contract_key text NOT NULL,
    address text NOT NULL,
    chain_id integer DEFAULT 97 NOT NULL,
    deployment_tx_hash text,
    deployment_block_number bigint,
    abi_version text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_registry_address_check CHECK ((address = lower(address)))
);


--
-- Name: creator_fee_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_fee_claims (
    id bigint NOT NULL,
    creator_address text NOT NULL,
    amount_bnb numeric(78,18) NOT NULL,
    tx_hash text NOT NULL,
    log_index integer DEFAULT 0 NOT NULL,
    block_number bigint NOT NULL,
    block_time timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_fee_claims_amount_bnb_check CHECK ((amount_bnb > (0)::numeric)),
    CONSTRAINT creator_fee_claims_creator_address_check CHECK ((creator_address = lower(creator_address)))
);


--
-- Name: creator_fee_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_fee_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_fee_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_fee_claims_id_seq OWNED BY public.creator_fee_claims.id;


--
-- Name: creator_follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_follows (
    follower_address text NOT NULL,
    creator_address text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_follows_check CHECK ((follower_address <> creator_address)),
    CONSTRAINT creator_follows_creator_address_check CHECK ((creator_address = lower(creator_address))),
    CONSTRAINT creator_follows_follower_address_check CHECK ((follower_address = lower(follower_address)))
);


--
-- Name: deep_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deep_links (
    id bigint NOT NULL,
    code text NOT NULL,
    target_type text NOT NULL,
    token_address text,
    referrer_address text,
    click_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_clicked_at timestamp with time zone,
    CONSTRAINT deep_links_referrer_address_check CHECK (((referrer_address IS NULL) OR (referrer_address = lower(referrer_address)))),
    CONSTRAINT deep_links_target_type_check CHECK ((target_type = ANY (ARRAY['HOME'::text, 'TOKEN'::text, 'CREATE'::text, 'MISSION'::text])))
);


--
-- Name: deep_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deep_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deep_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deep_links_id_seq OWNED BY public.deep_links.id;


--
-- Name: email_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_wallets (
    email text NOT NULL,
    eoa_address text NOT NULL,
    scw_address text NOT NULL,
    encrypted_private_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_wallets_email_check CHECK ((email = lower(email))),
    CONSTRAINT email_wallets_eoa_address_check CHECK ((eoa_address = lower(eoa_address))),
    CONSTRAINT email_wallets_scw_address_check CHECK ((scw_address = lower(scw_address)))
);


--
-- Name: indexer_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indexer_state (
    key text NOT NULL,
    last_block_number bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: king_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.king_history (
    id bigint NOT NULL,
    token_address text NOT NULL,
    creator_address text NOT NULL,
    score numeric(78,18) DEFAULT 0 NOT NULL,
    volume_24h_zug numeric(78,18) DEFAULT 0 NOT NULL,
    holder_count integer DEFAULT 0 NOT NULL,
    trade_count integer DEFAULT 0 NOT NULL,
    social_shares integer DEFAULT 0 NOT NULL,
    crowned_at timestamp with time zone DEFAULT now() NOT NULL,
    dethroned_at timestamp with time zone,
    points_event_id text,
    CONSTRAINT king_history_creator_address_check CHECK ((creator_address = lower(creator_address)))
);


--
-- Name: king_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.king_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: king_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.king_history_id_seq OWNED BY public.king_history.id;


--
-- Name: launchpad_points_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.launchpad_points_sync_log (
    id bigint NOT NULL,
    address text NOT NULL,
    task_key text NOT NULL,
    event_id text NOT NULL,
    tx_hash text,
    points_awarded integer NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone,
    CONSTRAINT launchpad_points_sync_log_address_check CHECK ((address = lower(address))),
    CONSTRAINT launchpad_points_sync_log_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT launchpad_points_sync_log_points_awarded_check CHECK ((points_awarded >= 0)),
    CONSTRAINT launchpad_points_sync_log_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'SYNCED'::text, 'FAILED'::text, 'SKIPPED'::text])))
);


--
-- Name: launchpad_points_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.launchpad_points_sync_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: launchpad_points_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.launchpad_points_sync_log_id_seq OWNED BY public.launchpad_points_sync_log.id;


--
-- Name: launchpad_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.launchpad_tasks (
    task_key text NOT NULL,
    title text NOT NULL,
    description text,
    reward_points integer NOT NULL,
    task_kind text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_url text,
    task_source text DEFAULT 'system'::text NOT NULL,
    CONSTRAINT launchpad_tasks_admin_link_url_check CHECK (((task_source <> 'admin_link'::text) OR ((target_url IS NOT NULL) AND (btrim(target_url) <> ''::text)))),
    CONSTRAINT launchpad_tasks_reward_points_check CHECK ((reward_points >= 0)),
    CONSTRAINT launchpad_tasks_task_kind_check CHECK ((task_kind = ANY (ARRAY['DAILY'::text, 'ONE_TIME'::text, 'MILESTONE'::text, 'ADMIN_LINK'::text]))),
    CONSTRAINT launchpad_tasks_task_source_check CHECK ((task_source = ANY (ARRAY['system'::text, 'admin_link'::text])))
);


--
-- Name: launchpad_user_daily_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.launchpad_user_daily_completions (
    id bigint NOT NULL,
    address text NOT NULL,
    task_key text NOT NULL,
    completed_date date NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    source_tx_hash text,
    source_event_id text,
    points_awarded integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT launchpad_user_daily_completions_address_check CHECK ((address = lower(address))),
    CONSTRAINT launchpad_user_daily_completions_points_awarded_check CHECK ((points_awarded >= 0))
);


--
-- Name: launchpad_user_daily_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.launchpad_user_daily_completions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: launchpad_user_daily_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.launchpad_user_daily_completions_id_seq OWNED BY public.launchpad_user_daily_completions.id;


--
-- Name: launchpad_user_task_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.launchpad_user_task_completions (
    id bigint NOT NULL,
    address text NOT NULL,
    task_key text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    source_tx_hash text,
    source_event_id text,
    points_awarded integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT launchpad_user_task_completions_address_check CHECK ((address = lower(address))),
    CONSTRAINT launchpad_user_task_completions_points_awarded_check CHECK ((points_awarded >= 0))
);


--
-- Name: launchpad_user_task_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.launchpad_user_task_completions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: launchpad_user_task_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.launchpad_user_task_completions_id_seq OWNED BY public.launchpad_user_task_completions.id;


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens (
    address text NOT NULL,
    chain_id integer DEFAULT 97 NOT NULL,
    creator_address text NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    decimals integer DEFAULT 18 NOT NULL,
    description text,
    logo_url text,
    metadata_uri text,
    launch_tx_hash text NOT NULL,
    launch_block_number bigint NOT NULL,
    status text DEFAULT 'BONDING'::text NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT tokens_address_check CHECK ((address = lower(address))),
    CONSTRAINT tokens_creator_address_check CHECK ((creator_address = lower(creator_address))),
    CONSTRAINT tokens_status_check CHECK ((status = ANY (ARRAY['BONDING'::text, 'PAUSED'::text, 'FAILED'::text])))
);


--
-- Name: trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trades (
    id bigint NOT NULL,
    event_id text NOT NULL,
    token_address text NOT NULL,
    trader_address text NOT NULL,
    side text NOT NULL,
    zug_amount numeric(78,18) NOT NULL,
    token_amount numeric(78,18) NOT NULL,
    price_zug numeric(78,18) NOT NULL,
    fee_zug numeric(78,18) DEFAULT 0 NOT NULL,
    creator_fee_zug numeric(78,18) DEFAULT 0 NOT NULL,
    treasury_fee_zug numeric(78,18) DEFAULT 0 NOT NULL,
    tx_hash text NOT NULL,
    log_index integer NOT NULL,
    block_number bigint NOT NULL,
    block_time timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    referrer_fee_zug numeric(78,18) DEFAULT 0 NOT NULL,
    spot_price_zug numeric(78,18),
    native_usd_rate numeric(24,8),
    CONSTRAINT trades_creator_fee_zug_check CHECK ((creator_fee_zug >= (0)::numeric)),
    CONSTRAINT trades_fee_zug_check CHECK ((fee_zug >= (0)::numeric)),
    CONSTRAINT trades_price_zug_check CHECK ((price_zug >= (0)::numeric)),
    CONSTRAINT trades_side_check CHECK ((side = ANY (ARRAY['BUY'::text, 'SELL'::text]))),
    CONSTRAINT trades_token_amount_check CHECK ((token_amount >= (0)::numeric)),
    CONSTRAINT trades_trader_address_check CHECK ((trader_address = lower(trader_address))),
    CONSTRAINT trades_treasury_fee_zug_check CHECK ((treasury_fee_zug >= (0)::numeric)),
    CONSTRAINT trades_zug_amount_check CHECK ((zug_amount >= (0)::numeric))
);


--
-- Name: COLUMN trades.spot_price_zug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trades.spot_price_zug IS 'Bonding-curve marginal spot after trade (BNB per token); price_zug remains execution fill';


--
-- Name: COLUMN trades.native_usd_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trades.native_usd_rate IS 'Native/USD (ETH or BNB) at indexer ingest time; freezes trade tape USD columns.';


--
-- Name: mv_token_price_anchors; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_token_price_anchors AS
 SELECT address AS token_address,
    ( SELECT tr.price_zug
           FROM public.trades tr
          WHERE ((tr.token_address = t.address) AND (tr.block_time >= (now() - '01:00:00'::interval)))
          ORDER BY tr.block_time, tr.block_number, tr.log_index
         LIMIT 1) AS price_1h_ago,
    ( SELECT tr.price_zug
           FROM public.trades tr
          WHERE ((tr.token_address = t.address) AND (tr.block_time >= (now() - '06:00:00'::interval)))
          ORDER BY tr.block_time, tr.block_number, tr.log_index
         LIMIT 1) AS price_6h_ago,
    ( SELECT tr.price_zug
           FROM public.trades tr
          WHERE ((tr.token_address = t.address) AND (tr.block_time <= (now() - '24:00:00'::interval)))
          ORDER BY tr.block_time DESC, tr.block_number DESC, tr.log_index DESC
         LIMIT 1) AS price_24h_ago,
    ( SELECT tr.price_zug
           FROM public.trades tr
          WHERE (tr.token_address = t.address)
          ORDER BY tr.block_time, tr.block_number, tr.log_index
         LIMIT 1) AS price_first
   FROM public.tokens t
  WHERE (is_hidden = false)
  WITH NO DATA;


--
-- Name: mv_token_trade_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_token_trade_stats AS
 SELECT token_address,
    (count(*))::integer AS trade_count,
    (COALESCE(sum(GREATEST((zug_amount - COALESCE(fee_zug, (0)::numeric)), (0)::numeric)) FILTER (WHERE (block_time >= (now() - '24:00:00'::interval))), (0)::numeric))::text AS volume_24h_zug,
    (COALESCE(sum(GREATEST((zug_amount - COALESCE(fee_zug, (0)::numeric)), (0)::numeric)) FILTER (WHERE ((block_time >= (now() - '48:00:00'::interval)) AND (block_time < (now() - '24:00:00'::interval)))), (0)::numeric))::text AS volume_24h_prev_zug,
    (count(*) FILTER (WHERE (block_time < (now() - '24:00:00'::interval))))::integer AS trade_count_24h_ago,
    (count(DISTINCT trader_address) FILTER (WHERE (block_time >= (now() - '24:00:00'::interval))))::integer AS traders_24h,
    max(price_zug) AS ath_price_zug
   FROM public.trades tr
  GROUP BY token_address
  WITH NO DATA;


--
-- Name: oauth_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_wallets (
    provider text NOT NULL,
    subject text NOT NULL,
    email text,
    display_name text,
    eoa_address text NOT NULL,
    scw_address text NOT NULL,
    encrypted_private_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_wallets_eoa_address_check CHECK ((eoa_address = lower(eoa_address))),
    CONSTRAINT oauth_wallets_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'apple'::text]))),
    CONSTRAINT oauth_wallets_scw_address_check CHECK ((scw_address = lower(scw_address)))
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);


--
-- Name: points_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_audit_log (
    id bigint NOT NULL,
    address text NOT NULL,
    points_awarded integer NOT NULL,
    task_type text NOT NULL,
    tx_hash text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT points_audit_log_address_check CHECK ((address = lower(address)))
);


--
-- Name: points_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.points_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: points_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.points_audit_log_id_seq OWNED BY public.points_audit_log.id;


--
-- Name: referral_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_bindings (
    invitee_address text NOT NULL,
    referrer_address text NOT NULL,
    bound_tx_hash text,
    bound_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referral_bindings_check CHECK ((invitee_address <> referrer_address)),
    CONSTRAINT referral_bindings_invitee_address_check CHECK ((invitee_address = lower(invitee_address))),
    CONSTRAINT referral_bindings_referrer_address_check CHECK ((referrer_address = lower(referrer_address)))
);


--
-- Name: referrer_fee_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrer_fee_claims (
    id bigint NOT NULL,
    referrer_address text NOT NULL,
    amount_bnb numeric(78,18) NOT NULL,
    tx_hash text NOT NULL,
    log_index integer DEFAULT 0 NOT NULL,
    block_number bigint NOT NULL,
    block_time timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referrer_fee_claims_amount_bnb_check CHECK ((amount_bnb > (0)::numeric)),
    CONSTRAINT referrer_fee_claims_referrer_address_check CHECK ((referrer_address = lower(referrer_address)))
);


--
-- Name: referrer_fee_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.referrer_fee_claims ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.referrer_fee_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: telegram_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_wallets (
    telegram_id bigint NOT NULL,
    telegram_username text,
    first_name text,
    eoa_address text NOT NULL,
    scw_address text NOT NULL,
    encrypted_private_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_wallets_eoa_address_check CHECK ((eoa_address = lower(eoa_address))),
    CONSTRAINT telegram_wallets_scw_address_check CHECK ((scw_address = lower(scw_address)))
);


--
-- Name: token_board_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_board_stats (
    token_address text NOT NULL,
    market_cap_zug numeric DEFAULT 0 NOT NULL,
    spot_price_zug numeric DEFAULT 0 NOT NULL,
    ath_market_cap_zug numeric DEFAULT 0 NOT NULL,
    ath_price_zug numeric,
    reserve_zug numeric DEFAULT 0 NOT NULL,
    token_sold numeric DEFAULT 0 NOT NULL,
    progress_bps integer DEFAULT 0 NOT NULL,
    trade_count integer DEFAULT 0 NOT NULL,
    holder_count integer DEFAULT 0 NOT NULL,
    volume_24h_zug numeric DEFAULT 0 NOT NULL,
    volume_24h_prev_zug numeric DEFAULT 0 NOT NULL,
    trade_count_24h_ago integer DEFAULT 0 NOT NULL,
    traders_24h integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: token_candles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_candles (
    token_address text NOT NULL,
    candle_interval text NOT NULL,
    bucket_ts timestamp with time zone NOT NULL,
    open_zug numeric NOT NULL,
    high_zug numeric NOT NULL,
    low_zug numeric NOT NULL,
    close_zug numeric NOT NULL,
    volume_zug numeric DEFAULT 0 NOT NULL,
    buy_volume_zug numeric DEFAULT 0 NOT NULL,
    trade_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    close_usd numeric(38,18),
    native_usd_rate numeric(24,8),
    CONSTRAINT token_candles_address_check CHECK ((token_address = lower(token_address))),
    CONSTRAINT token_candles_interval_check CHECK ((candle_interval = ANY (ARRAY['15s'::text, '1m'::text, '5m'::text, '15m'::text, '1h'::text, '4h'::text]))),
    CONSTRAINT token_candles_ohlc_check CHECK (((open_zug >= (0)::numeric) AND (high_zug >= (0)::numeric) AND (low_zug >= (0)::numeric) AND (close_zug >= (0)::numeric) AND (high_zug >= low_zug))),
    CONSTRAINT token_candles_trade_count_check CHECK ((trade_count >= 0)),
    CONSTRAINT token_candles_volume_check CHECK (((volume_zug >= (0)::numeric) AND (buy_volume_zug >= (0)::numeric) AND (buy_volume_zug <= volume_zug)))
);


--
-- Name: COLUMN token_candles.close_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.token_candles.close_usd IS 'USD spot close at last trade in bucket (close_zug * native_usd_rate). Gap bars: compute at read time.';


--
-- Name: COLUMN token_candles.native_usd_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.token_candles.native_usd_rate IS 'BNB/ETH USDT rate when bucket was last updated by indexer';


--
-- Name: token_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_favorites (
    user_address text NOT NULL,
    token_address text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_favorites_user_address_check CHECK ((user_address = lower(user_address)))
);


--
-- Name: token_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_media (
    id bigint NOT NULL,
    token_address text NOT NULL,
    media_type text NOT NULL,
    url text NOT NULL,
    content_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_media_media_type_check CHECK ((media_type = ANY (ARRAY['LOGO'::text, 'BANNER'::text, 'SOCIAL_PREVIEW'::text])))
);


--
-- Name: token_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.token_media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: token_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.token_media_id_seq OWNED BY public.token_media.id;


--
-- Name: trades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trades_id_seq OWNED BY public.trades.id;


--
-- Name: user_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_positions (
    token_address text NOT NULL,
    address text NOT NULL,
    token_balance numeric(78,18) DEFAULT 0 NOT NULL,
    total_bought_zug numeric(78,18) DEFAULT 0 NOT NULL,
    total_sold_zug numeric(78,18) DEFAULT 0 NOT NULL,
    realized_pnl_zug numeric(78,18) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    remaining_cost_basis_zug numeric(78,18) DEFAULT 0 NOT NULL,
    remaining_cost_basis_usd numeric(24,8) DEFAULT 0 NOT NULL,
    realized_pnl_usd numeric(24,8) DEFAULT 0 NOT NULL,
    CONSTRAINT user_positions_address_check CHECK ((address = lower(address)))
);


--
-- Name: COLUMN user_positions.remaining_cost_basis_zug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_positions.remaining_cost_basis_zug IS 'Open-lot cost basis (net BNB after fees). Resets when token_balance reaches 0.';


--
-- Name: COLUMN user_positions.remaining_cost_basis_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_positions.remaining_cost_basis_usd IS 'Open-lot USD cost (net native ├ù native_usd_rate at each buy). Resets at zero balance.';


--
-- Name: COLUMN user_positions.realized_pnl_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_positions.realized_pnl_usd IS 'Cumulative realized P/L in USD (sell proceeds USD ظêْ avg-cost USD removed).';


--
-- Name: user_volumes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_volumes (
    address text NOT NULL,
    total_volume_zug numeric(78,18) DEFAULT 0 NOT NULL,
    buy_volume_zug numeric(78,18) DEFAULT 0 NOT NULL,
    sell_volume_zug numeric(78,18) DEFAULT 0 NOT NULL,
    last_trade_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_volumes_address_check CHECK ((address = lower(address)))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    address text NOT NULL,
    points bigint DEFAULT 0 NOT NULL,
    multiplier numeric DEFAULT 1.0 NOT NULL,
    last_active timestamp with time zone DEFAULT now() NOT NULL,
    telegram_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_id text,
    username text,
    CONSTRAINT users_address_check CHECK ((address = lower(address))),
    CONSTRAINT users_username_check CHECK (((username IS NULL) OR (username = lower(username))))
);


--
-- Name: admin_todos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_todos ALTER COLUMN id SET DEFAULT nextval('public.admin_todos_id_seq'::regclass);


--
-- Name: airdrop_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_allocations ALTER COLUMN id SET DEFAULT nextval('public.airdrop_allocations_id_seq'::regclass);


--
-- Name: airdrop_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_claims ALTER COLUMN id SET DEFAULT nextval('public.airdrop_claims_id_seq'::regclass);


--
-- Name: airdrop_social_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_social_tasks ALTER COLUMN id SET DEFAULT nextval('public.airdrop_social_tasks_id_seq'::regclass);


--
-- Name: airdrop_task_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_task_completions ALTER COLUMN id SET DEFAULT nextval('public.airdrop_task_completions_id_seq'::regclass);


--
-- Name: airdrops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrops ALTER COLUMN id SET DEFAULT nextval('public.airdrops_id_seq'::regclass);


--
-- Name: creator_fee_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_fee_claims ALTER COLUMN id SET DEFAULT nextval('public.creator_fee_claims_id_seq'::regclass);


--
-- Name: deep_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deep_links ALTER COLUMN id SET DEFAULT nextval('public.deep_links_id_seq'::regclass);


--
-- Name: king_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.king_history ALTER COLUMN id SET DEFAULT nextval('public.king_history_id_seq'::regclass);


--
-- Name: launchpad_points_sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_points_sync_log ALTER COLUMN id SET DEFAULT nextval('public.launchpad_points_sync_log_id_seq'::regclass);


--
-- Name: launchpad_user_daily_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_daily_completions ALTER COLUMN id SET DEFAULT nextval('public.launchpad_user_daily_completions_id_seq'::regclass);


--
-- Name: launchpad_user_task_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_task_completions ALTER COLUMN id SET DEFAULT nextval('public.launchpad_user_task_completions_id_seq'::regclass);


--
-- Name: points_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_audit_log ALTER COLUMN id SET DEFAULT nextval('public.points_audit_log_id_seq'::regclass);


--
-- Name: token_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_media ALTER COLUMN id SET DEFAULT nextval('public.token_media_id_seq'::regclass);


--
-- Name: trades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades ALTER COLUMN id SET DEFAULT nextval('public.trades_id_seq'::regclass);


--
-- Name: admin_todos admin_todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_todos
    ADD CONSTRAINT admin_todos_pkey PRIMARY KEY (id);


--
-- Name: airdrop_allocations airdrop_allocations_airdrop_id_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_allocations
    ADD CONSTRAINT airdrop_allocations_airdrop_id_address_key UNIQUE (airdrop_id, address);


--
-- Name: airdrop_allocations airdrop_allocations_airdrop_id_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_allocations
    ADD CONSTRAINT airdrop_allocations_airdrop_id_rank_key UNIQUE (airdrop_id, rank);


--
-- Name: airdrop_allocations airdrop_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_allocations
    ADD CONSTRAINT airdrop_allocations_pkey PRIMARY KEY (id);


--
-- Name: airdrop_claims airdrop_claims_airdrop_id_claimant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_claims
    ADD CONSTRAINT airdrop_claims_airdrop_id_claimant_key UNIQUE (airdrop_id, claimant);


--
-- Name: airdrop_claims airdrop_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_claims
    ADD CONSTRAINT airdrop_claims_pkey PRIMARY KEY (id);


--
-- Name: airdrop_participants airdrop_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_participants
    ADD CONSTRAINT airdrop_participants_pkey PRIMARY KEY (airdrop_id, address);


--
-- Name: airdrop_saves airdrop_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_saves
    ADD CONSTRAINT airdrop_saves_pkey PRIMARY KEY (user_address, airdrop_id);


--
-- Name: airdrop_social_tasks airdrop_social_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_social_tasks
    ADD CONSTRAINT airdrop_social_tasks_pkey PRIMARY KEY (id);


--
-- Name: airdrop_task_completions airdrop_task_completions_airdrop_id_task_id_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_task_completions
    ADD CONSTRAINT airdrop_task_completions_airdrop_id_task_id_address_key UNIQUE (airdrop_id, task_id, address);


--
-- Name: airdrop_task_completions airdrop_task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_task_completions
    ADD CONSTRAINT airdrop_task_completions_pkey PRIMARY KEY (id);


--
-- Name: airdrops airdrops_on_chain_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrops
    ADD CONSTRAINT airdrops_on_chain_id_key UNIQUE (on_chain_id);


--
-- Name: airdrops airdrops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrops
    ADD CONSTRAINT airdrops_pkey PRIMARY KEY (id);


--
-- Name: bonding_states bonding_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonding_states
    ADD CONSTRAINT bonding_states_pkey PRIMARY KEY (token_address);


--
-- Name: contract_registry contract_registry_chain_id_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_registry
    ADD CONSTRAINT contract_registry_chain_id_address_key UNIQUE (chain_id, address);


--
-- Name: contract_registry contract_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_registry
    ADD CONSTRAINT contract_registry_pkey PRIMARY KEY (contract_key);


--
-- Name: creator_fee_claims creator_fee_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_fee_claims
    ADD CONSTRAINT creator_fee_claims_pkey PRIMARY KEY (id);


--
-- Name: creator_fee_claims creator_fee_claims_tx_hash_log_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_fee_claims
    ADD CONSTRAINT creator_fee_claims_tx_hash_log_index_key UNIQUE (tx_hash, log_index);


--
-- Name: creator_follows creator_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_follows
    ADD CONSTRAINT creator_follows_pkey PRIMARY KEY (follower_address, creator_address);


--
-- Name: deep_links deep_links_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deep_links
    ADD CONSTRAINT deep_links_code_key UNIQUE (code);


--
-- Name: deep_links deep_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deep_links
    ADD CONSTRAINT deep_links_pkey PRIMARY KEY (id);


--
-- Name: email_wallets email_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_wallets
    ADD CONSTRAINT email_wallets_pkey PRIMARY KEY (email);


--
-- Name: indexer_state indexer_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indexer_state
    ADD CONSTRAINT indexer_state_pkey PRIMARY KEY (key);


--
-- Name: king_history king_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.king_history
    ADD CONSTRAINT king_history_pkey PRIMARY KEY (id);


--
-- Name: launchpad_points_sync_log launchpad_points_sync_log_address_task_key_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_points_sync_log
    ADD CONSTRAINT launchpad_points_sync_log_address_task_key_event_id_key UNIQUE (address, task_key, event_id);


--
-- Name: launchpad_points_sync_log launchpad_points_sync_log_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_points_sync_log
    ADD CONSTRAINT launchpad_points_sync_log_event_id_key UNIQUE (event_id);


--
-- Name: launchpad_points_sync_log launchpad_points_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_points_sync_log
    ADD CONSTRAINT launchpad_points_sync_log_pkey PRIMARY KEY (id);


--
-- Name: launchpad_tasks launchpad_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_tasks
    ADD CONSTRAINT launchpad_tasks_pkey PRIMARY KEY (task_key);


--
-- Name: launchpad_user_daily_completions launchpad_user_daily_completi_address_task_key_completed_da_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_daily_completions
    ADD CONSTRAINT launchpad_user_daily_completi_address_task_key_completed_da_key UNIQUE (address, task_key, completed_date);


--
-- Name: launchpad_user_daily_completions launchpad_user_daily_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_daily_completions
    ADD CONSTRAINT launchpad_user_daily_completions_pkey PRIMARY KEY (id);


--
-- Name: launchpad_user_task_completions launchpad_user_task_completions_address_task_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_task_completions
    ADD CONSTRAINT launchpad_user_task_completions_address_task_key_key UNIQUE (address, task_key);


--
-- Name: launchpad_user_task_completions launchpad_user_task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_task_completions
    ADD CONSTRAINT launchpad_user_task_completions_pkey PRIMARY KEY (id);


--
-- Name: oauth_wallets oauth_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_wallets
    ADD CONSTRAINT oauth_wallets_pkey PRIMARY KEY (provider, subject);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: points_audit_log points_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_audit_log
    ADD CONSTRAINT points_audit_log_pkey PRIMARY KEY (id);


--
-- Name: referral_bindings referral_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_bindings
    ADD CONSTRAINT referral_bindings_pkey PRIMARY KEY (invitee_address);


--
-- Name: referrer_fee_claims referrer_fee_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrer_fee_claims
    ADD CONSTRAINT referrer_fee_claims_pkey PRIMARY KEY (id);


--
-- Name: referrer_fee_claims referrer_fee_claims_tx_hash_log_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrer_fee_claims
    ADD CONSTRAINT referrer_fee_claims_tx_hash_log_index_key UNIQUE (tx_hash, log_index);


--
-- Name: telegram_wallets telegram_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_wallets
    ADD CONSTRAINT telegram_wallets_pkey PRIMARY KEY (telegram_id);


--
-- Name: token_board_stats token_board_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_board_stats
    ADD CONSTRAINT token_board_stats_pkey PRIMARY KEY (token_address);


--
-- Name: token_candles token_candles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_candles
    ADD CONSTRAINT token_candles_pkey PRIMARY KEY (token_address, candle_interval, bucket_ts);


--
-- Name: token_favorites token_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_favorites
    ADD CONSTRAINT token_favorites_pkey PRIMARY KEY (user_address, token_address);


--
-- Name: token_media token_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_media
    ADD CONSTRAINT token_media_pkey PRIMARY KEY (id);


--
-- Name: token_media token_media_token_address_media_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_media
    ADD CONSTRAINT token_media_token_address_media_type_key UNIQUE (token_address, media_type);


--
-- Name: tokens tokens_chain_id_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_chain_id_address_key UNIQUE (chain_id, address);


--
-- Name: tokens tokens_launch_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_launch_tx_hash_key UNIQUE (launch_tx_hash);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (address);


--
-- Name: trades trades_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_event_id_key UNIQUE (event_id);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY (id);


--
-- Name: trades trades_tx_hash_log_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_tx_hash_log_index_key UNIQUE (tx_hash, log_index);


--
-- Name: user_positions user_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_positions
    ADD CONSTRAINT user_positions_pkey PRIMARY KEY (token_address, address);


--
-- Name: user_volumes user_volumes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_volumes
    ADD CONSTRAINT user_volumes_pkey PRIMARY KEY (address);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (address);


--
-- Name: idx_admin_todos_open_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_todos_open_sort ON public.admin_todos USING btree (is_completed, sort_order, id);


--
-- Name: idx_airdrop_allocations_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_allocations_address ON public.airdrop_allocations USING btree (address, created_at DESC);


--
-- Name: idx_airdrop_allocations_airdrop_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_allocations_airdrop_rank ON public.airdrop_allocations USING btree (airdrop_id, rank);


--
-- Name: idx_airdrop_claims_airdrop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_claims_airdrop ON public.airdrop_claims USING btree (airdrop_id, block_time DESC);


--
-- Name: idx_airdrop_participants_address_onchain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_participants_address_onchain ON public.airdrop_participants USING btree (address, first_onchain_at DESC) WHERE (first_onchain_at IS NOT NULL);


--
-- Name: idx_airdrop_participants_address_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_participants_address_updated ON public.airdrop_participants USING btree (address, updated_at DESC);


--
-- Name: idx_airdrop_saves_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_saves_user ON public.airdrop_saves USING btree (user_address, created_at DESC);


--
-- Name: idx_airdrop_social_tasks_airdrop; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_social_tasks_airdrop ON public.airdrop_social_tasks USING btree (airdrop_id, sort_order);


--
-- Name: idx_airdrop_task_completions_airdrop_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrop_task_completions_airdrop_address ON public.airdrop_task_completions USING btree (airdrop_id, address);


--
-- Name: idx_airdrops_linked_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrops_linked_token ON public.airdrops USING btree (linked_token, qualify_end DESC);


--
-- Name: idx_airdrops_linked_token_qualify; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrops_linked_token_qualify ON public.airdrops USING btree (linked_token, qualify_start, qualify_end);


--
-- Name: idx_airdrops_status_qualify_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airdrops_status_qualify_end ON public.airdrops USING btree (status, qualify_end DESC);


--
-- Name: idx_bonding_states_mcap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonding_states_mcap ON public.bonding_states USING btree (market_cap_zug DESC) WHERE (market_cap_zug > (0)::numeric);


--
-- Name: idx_contract_registry_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_registry_active ON public.contract_registry USING btree (is_active, contract_key);


--
-- Name: idx_creator_fee_claims_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_fee_claims_creator ON public.creator_fee_claims USING btree (creator_address, block_time DESC);


--
-- Name: idx_creator_follows_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_follows_creator ON public.creator_follows USING btree (creator_address);


--
-- Name: idx_creator_follows_follower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_follows_follower ON public.creator_follows USING btree (follower_address, created_at DESC);


--
-- Name: idx_email_wallets_eoa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_wallets_eoa ON public.email_wallets USING btree (eoa_address);


--
-- Name: idx_email_wallets_scw; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_wallets_scw ON public.email_wallets USING btree (scw_address);


--
-- Name: idx_king_history_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_king_history_active ON public.king_history USING btree (crowned_at DESC) WHERE (dethroned_at IS NULL);


--
-- Name: idx_launchpad_daily_completions_address_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_launchpad_daily_completions_address_date ON public.launchpad_user_daily_completions USING btree (address, completed_date DESC);


--
-- Name: idx_launchpad_task_completions_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_launchpad_task_completions_address ON public.launchpad_user_task_completions USING btree (address);


--
-- Name: idx_mv_token_price_anchors_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_token_price_anchors_token ON public.mv_token_price_anchors USING btree (token_address);


--
-- Name: idx_mv_token_trade_stats_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_token_trade_stats_token ON public.mv_token_trade_stats USING btree (token_address);


--
-- Name: idx_oauth_wallets_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_wallets_email ON public.oauth_wallets USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: idx_oauth_wallets_eoa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_oauth_wallets_eoa ON public.oauth_wallets USING btree (eoa_address);


--
-- Name: idx_oauth_wallets_scw; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_oauth_wallets_scw ON public.oauth_wallets USING btree (scw_address);


--
-- Name: idx_points_audit_log_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_points_audit_log_address ON public.points_audit_log USING btree (address, created_at DESC);


--
-- Name: idx_referral_bindings_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_bindings_referrer ON public.referral_bindings USING btree (referrer_address, bound_at DESC);


--
-- Name: idx_referrer_fee_claims_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrer_fee_claims_referrer ON public.referrer_fee_claims USING btree (referrer_address, block_time DESC);


--
-- Name: idx_telegram_wallets_eoa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telegram_wallets_eoa ON public.telegram_wallets USING btree (eoa_address);


--
-- Name: idx_telegram_wallets_scw; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telegram_wallets_scw ON public.telegram_wallets USING btree (scw_address);


--
-- Name: idx_token_board_stats_mcap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_board_stats_mcap ON public.token_board_stats USING btree (market_cap_zug DESC);


--
-- Name: idx_token_board_stats_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_board_stats_updated ON public.token_board_stats USING btree (updated_at DESC);


--
-- Name: idx_token_board_stats_volume_24h; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_board_stats_volume_24h ON public.token_board_stats USING btree (volume_24h_zug DESC) WHERE (volume_24h_zug > (0)::numeric);


--
-- Name: idx_token_candles_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_candles_lookup ON public.token_candles USING btree (token_address, candle_interval, bucket_ts DESC);


--
-- Name: idx_token_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_favorites_user ON public.token_favorites USING btree (user_address, created_at DESC);


--
-- Name: idx_tokens_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_creator ON public.tokens USING btree (creator_address, created_at DESC);


--
-- Name: idx_tokens_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_status_created ON public.tokens USING btree (status, created_at DESC);


--
-- Name: idx_tokens_visible_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_visible_created ON public.tokens USING btree (created_at DESC) WHERE (is_hidden = false);


--
-- Name: idx_tokens_visible_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_visible_status_created ON public.tokens USING btree (status, created_at DESC) WHERE (is_hidden = false);


--
-- Name: idx_trades_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_block ON public.trades USING btree (block_number, log_index);


--
-- Name: idx_trades_block_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_block_time ON public.trades USING btree (block_time DESC);


--
-- Name: idx_trades_token_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_token_block ON public.trades USING btree (token_address, block_number DESC);


--
-- Name: idx_trades_token_side_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_token_side_time ON public.trades USING btree (token_address, side, block_time DESC);


--
-- Name: idx_trades_token_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_token_time ON public.trades USING btree (token_address, block_time DESC);


--
-- Name: idx_trades_token_time_asc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_token_time_asc ON public.trades USING btree (token_address, block_time, block_number, log_index);


--
-- Name: idx_trades_token_time_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_token_time_desc ON public.trades USING btree (token_address, block_time DESC, log_index DESC);


--
-- Name: idx_trades_trader_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_trader_time ON public.trades USING btree (trader_address, block_time DESC);


--
-- Name: idx_user_positions_address_balance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_positions_address_balance ON public.user_positions USING btree (address, token_balance DESC) WHERE (token_balance > (0)::numeric);


--
-- Name: idx_user_positions_address_holders; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_positions_address_holders ON public.user_positions USING btree (address) WHERE (token_balance > (0)::numeric);


--
-- Name: idx_user_positions_token_holders; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_positions_token_holders ON public.user_positions USING btree (token_address) WHERE (token_balance > (0)::numeric);


--
-- Name: idx_user_volumes_total; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_volumes_total ON public.user_volumes USING btree (total_volume_zug DESC);


--
-- Name: idx_users_avatar_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_avatar_id ON public.users USING btree (avatar_id) WHERE (avatar_id IS NOT NULL);


--
-- Name: idx_users_username_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_username_lower ON public.users USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: uq_king_history_single_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_king_history_single_active ON public.king_history USING btree ((true)) WHERE (dethroned_at IS NULL);


--
-- Name: airdrop_allocations airdrop_allocations_airdrop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_allocations
    ADD CONSTRAINT airdrop_allocations_airdrop_id_fkey FOREIGN KEY (airdrop_id) REFERENCES public.airdrops(id) ON DELETE CASCADE;


--
-- Name: airdrop_claims airdrop_claims_airdrop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_claims
    ADD CONSTRAINT airdrop_claims_airdrop_id_fkey FOREIGN KEY (airdrop_id) REFERENCES public.airdrops(id) ON DELETE CASCADE;


--
-- Name: airdrop_participants airdrop_participants_airdrop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_participants
    ADD CONSTRAINT airdrop_participants_airdrop_id_fkey FOREIGN KEY (airdrop_id) REFERENCES public.airdrops(id) ON DELETE CASCADE;


--
-- Name: airdrop_saves airdrop_saves_airdrop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_saves
    ADD CONSTRAINT airdrop_saves_airdrop_id_fkey FOREIGN KEY (airdrop_id) REFERENCES public.airdrops(id) ON DELETE CASCADE;


--
-- Name: airdrop_social_tasks airdrop_social_tasks_airdrop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_social_tasks
    ADD CONSTRAINT airdrop_social_tasks_airdrop_id_fkey FOREIGN KEY (airdrop_id) REFERENCES public.airdrops(id) ON DELETE CASCADE;


--
-- Name: airdrop_task_completions airdrop_task_completions_airdrop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_task_completions
    ADD CONSTRAINT airdrop_task_completions_airdrop_id_fkey FOREIGN KEY (airdrop_id) REFERENCES public.airdrops(id) ON DELETE CASCADE;


--
-- Name: airdrop_task_completions airdrop_task_completions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airdrop_task_completions
    ADD CONSTRAINT airdrop_task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.airdrop_social_tasks(id) ON DELETE CASCADE;


--
-- Name: bonding_states bonding_states_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonding_states
    ADD CONSTRAINT bonding_states_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- Name: king_history king_history_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.king_history
    ADD CONSTRAINT king_history_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- Name: launchpad_points_sync_log launchpad_points_sync_log_task_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_points_sync_log
    ADD CONSTRAINT launchpad_points_sync_log_task_key_fkey FOREIGN KEY (task_key) REFERENCES public.launchpad_tasks(task_key);


--
-- Name: launchpad_user_daily_completions launchpad_user_daily_completions_task_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_daily_completions
    ADD CONSTRAINT launchpad_user_daily_completions_task_key_fkey FOREIGN KEY (task_key) REFERENCES public.launchpad_tasks(task_key);


--
-- Name: launchpad_user_task_completions launchpad_user_task_completions_task_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.launchpad_user_task_completions
    ADD CONSTRAINT launchpad_user_task_completions_task_key_fkey FOREIGN KEY (task_key) REFERENCES public.launchpad_tasks(task_key);


--
-- Name: token_board_stats token_board_stats_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_board_stats
    ADD CONSTRAINT token_board_stats_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- Name: token_candles token_candles_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_candles
    ADD CONSTRAINT token_candles_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- Name: token_favorites token_favorites_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_favorites
    ADD CONSTRAINT token_favorites_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- Name: token_media token_media_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_media
    ADD CONSTRAINT token_media_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- Name: trades trades_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- Name: user_positions user_positions_token_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_positions
    ADD CONSTRAINT user_positions_token_address_fkey FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 6MRwp4avbUH99PHaR2MwpERig6ZtyP5PJ9wLIXT0cmYA5qiMObzwd9w0ykMFqbQ

