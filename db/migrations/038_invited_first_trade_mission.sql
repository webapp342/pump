-- Invited Trader: ONE_TIME reward for invitees who complete a first trade.
-- Uses existing referral_bindings + trades (no new tracking tables).

INSERT INTO launchpad_tasks (
  task_key, title, description, reward_points, task_kind, task_source, is_active
) VALUES (
  'LAUNCHPAD_INVITED_FIRST_TRADE',
  'Invited Trader',
  'Join with an invite link — completes when your first trade binds the referral.',
  250,
  'ONE_TIME',
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
