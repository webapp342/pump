-- Preserve Solana base58 wallet case in launchpad points functions.
-- EVM 0x addresses stay lowercase for backward compatibility.

CREATE OR REPLACE FUNCTION public.launchpad_normalize_wallet_address(p_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_address IS NULL OR btrim(p_address) = '' THEN NULL
    WHEN left(lower(btrim(p_address)), 2) = '0x' THEN lower(btrim(p_address))
    ELSE btrim(p_address)
  END;
$$;

CREATE OR REPLACE FUNCTION public.launchpad_award_points(
  p_address text,
  p_task_key text,
  p_event_id text,
  p_tx_hash text DEFAULT NULL::text,
  p_completed_date date DEFAULT NULL::date,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(status text, points_awarded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_address text := launchpad_normalize_wallet_address(p_address);
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

CREATE OR REPLACE FUNCTION public.launchpad_ensure_user(
  p_address text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(out_address text, created boolean, telegram_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_address text := launchpad_normalize_wallet_address(p_address);
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

CREATE OR REPLACE FUNCTION public.launchpad_redeem_points(
  p_address text,
  p_item_id text,
  p_cost_pts integer,
  p_redeem_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  status text,
  points_spent integer,
  spendable_points bigint,
  lifetime_points bigint,
  inventory_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_address text := launchpad_normalize_wallet_address(p_address);
  v_existing points_redemptions%ROWTYPE;
  v_points bigint;
  v_lifetime bigint;
  v_inv_id bigint;
  v_redemption_id bigint;
BEGIN
  IF v_address IS NULL OR v_address = '' THEN
    RAISE EXCEPTION 'address is required';
  END IF;
  IF p_item_id IS NULL OR btrim(p_item_id) = '' THEN
    RAISE EXCEPTION 'item_id is required';
  END IF;
  IF p_redeem_key IS NULL OR btrim(p_redeem_key) = '' THEN
    RAISE EXCEPTION 'redeem_key is required';
  END IF;
  IF p_cost_pts IS NULL OR p_cost_pts <= 0 THEN
    RAISE EXCEPTION 'cost_pts must be positive';
  END IF;

  SELECT * INTO v_existing
  FROM points_redemptions
  WHERE redeem_key = p_redeem_key
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(u.points, 0), COALESCE(u.points_lifetime, u.points, 0)
      INTO v_points, v_lifetime
    FROM users u WHERE u.address = v_address;

    SELECT i.id INTO v_inv_id
    FROM points_inventory i
    WHERE i.redemption_id = v_existing.id
    ORDER BY i.id DESC
    LIMIT 1;

    status := 'IDEMPOTENT';
    points_spent := v_existing.cost_pts;
    spendable_points := COALESCE(v_points, 0);
    lifetime_points := COALESCE(v_lifetime, 0);
    inventory_id := v_inv_id;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO users (address, last_active)
  VALUES (v_address, now())
  ON CONFLICT (address) DO UPDATE SET last_active = EXCLUDED.last_active;

  SELECT COALESCE(points, 0), COALESCE(points_lifetime, points, 0)
    INTO v_points, v_lifetime
  FROM users
  WHERE address = v_address
  FOR UPDATE;

  IF v_points < p_cost_pts THEN
    RAISE EXCEPTION 'insufficient_points' USING ERRCODE = 'P0001';
  END IF;

  UPDATE users
  SET points = v_points - p_cost_pts,
      last_active = now()
  WHERE address = v_address;

  INSERT INTO points_redemptions (redeem_key, address, item_id, cost_pts, status, metadata)
  VALUES (p_redeem_key, v_address, p_item_id, p_cost_pts, 'completed', COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_redemption_id;

  INSERT INTO points_inventory (address, item_id, status, redemption_id, metadata)
  VALUES (
    v_address,
    p_item_id,
    'active',
    v_redemption_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('cost_pts', p_cost_pts)
  )
  RETURNING id INTO v_inv_id;

  INSERT INTO points_audit_log (address, points_awarded, task_type, tx_hash, metadata)
  VALUES (
    v_address,
    -p_cost_pts,
    'REDEEM:' || p_item_id,
    'redeem:' || p_redeem_key,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'redeem_key', p_redeem_key,
      'inventory_id', v_inv_id
    )
  );

  status := 'COMPLETED';
  points_spent := p_cost_pts;
  spendable_points := v_points - p_cost_pts;
  lifetime_points := v_lifetime;
  inventory_id := v_inv_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.launchpad_normalize_wallet_address(text) TO pump_indexer, pump_app;
GRANT EXECUTE ON FUNCTION public.launchpad_award_points(text, text, text, text, date, jsonb) TO pump_indexer, pump_app;
GRANT EXECUTE ON FUNCTION public.launchpad_ensure_user(text, jsonb) TO pump_indexer, pump_app;
GRANT EXECUTE ON FUNCTION public.launchpad_redeem_points(text, text, integer, text, jsonb) TO pump_indexer, pump_app;
