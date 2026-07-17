-- Referrer claimable XP: 50 per successful invite (referral_bindings row).
-- Replaces invitee-side LAUNCHPAD_INVITED_FIRST_TRADE auto-award.

CREATE TABLE IF NOT EXISTS referral_invite_xp_claims (
  referrer_address text NOT NULL,
  invitee_address text NOT NULL,
  points_awarded integer NOT NULL DEFAULT 50 CHECK (points_awarded > 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invitee_address),
  CONSTRAINT referral_invite_xp_claims_referrer_check CHECK (referrer_address = lower(referrer_address)),
  CONSTRAINT referral_invite_xp_claims_invitee_check CHECK (invitee_address = lower(invitee_address)),
  CONSTRAINT referral_invite_xp_claims_binding_fk FOREIGN KEY (invitee_address)
    REFERENCES referral_bindings (invitee_address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_invite_xp_claims_referrer
  ON referral_invite_xp_claims (referrer_address, claimed_at DESC);

DELETE FROM launchpad_user_task_completions WHERE task_key = 'LAUNCHPAD_INVITED_FIRST_TRADE';
DELETE FROM launchpad_points_sync_log WHERE task_key = 'LAUNCHPAD_INVITED_FIRST_TRADE';
DELETE FROM launchpad_tasks WHERE task_key = 'LAUNCHPAD_INVITED_FIRST_TRADE';

INSERT INTO launchpad_tasks (
  task_key, title, description, reward_points, task_kind, task_source, is_active
) VALUES (
  'LAUNCHPAD_REFERRAL_INVITE_XP',
  'Referral Invites',
  'Earn 50 XP per invitee when their first trade binds your referral link.',
  50,
  'MILESTONE',
  'system',
  true
)
ON CONFLICT (task_key) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  reward_points = EXCLUDED.reward_points,
  task_kind = EXCLUDED.task_kind,
  task_source = EXCLUDED.task_source,
  is_active = EXCLUDED.is_active,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.claim_referral_invite_xp(p_referrer text)
RETURNS TABLE(claimed_invites integer, points_awarded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer text := lower(p_referrer);
  v_points_per integer := 50;
  v_invitee text;
  v_total_points integer := 0;
  v_count integer := 0;
BEGIN
  IF v_referrer IS NULL OR v_referrer = '' THEN
    RAISE EXCEPTION 'address is required';
  END IF;

  INSERT INTO users (address, last_active)
  VALUES (v_referrer, now())
  ON CONFLICT (address) DO UPDATE SET last_active = now();

  FOR v_invitee IN
    SELECT rb.invitee_address
    FROM referral_bindings rb
    LEFT JOIN referral_invite_xp_claims c ON c.invitee_address = rb.invitee_address
    WHERE rb.referrer_address = v_referrer
      AND c.invitee_address IS NULL
    ORDER BY rb.bound_at ASC
  LOOP
    INSERT INTO referral_invite_xp_claims (referrer_address, invitee_address, points_awarded)
    VALUES (v_referrer, v_invitee, v_points_per);

    v_count := v_count + 1;
    v_total_points := v_total_points + v_points_per;

    INSERT INTO points_audit_log (address, points_awarded, task_type, tx_hash, metadata)
    VALUES (
      v_referrer,
      v_points_per,
      'LAUNCHPAD_REFERRAL_INVITE_XP',
      'claim:referral:' || v_invitee,
      jsonb_build_object('invitee', v_invitee, 'source', 'referral_invite_claim')
    );
  END LOOP;

  IF v_total_points > 0 THEN
    UPDATE users
    SET points = COALESCE(points, 0) + v_total_points,
        last_active = now()
    WHERE address = v_referrer;
  END IF;

  claimed_invites := v_count;
  points_awarded := v_total_points;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_referral_invite_xp(text) TO pump_indexer, pump_app;
