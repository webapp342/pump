-- Admin tarafından oluşturulan "tıkla → linke git → tamamlandı" taskleri

ALTER TABLE launchpad_tasks
  ADD COLUMN IF NOT EXISTS target_url text,
  ADD COLUMN IF NOT EXISTS task_source text NOT NULL DEFAULT 'system';

UPDATE launchpad_tasks SET task_source = 'system' WHERE task_source IS NULL;

ALTER TABLE launchpad_tasks DROP CONSTRAINT IF EXISTS launchpad_tasks_task_source_check;
ALTER TABLE launchpad_tasks
  ADD CONSTRAINT launchpad_tasks_task_source_check
  CHECK (task_source IN ('system', 'admin_link'));

ALTER TABLE launchpad_tasks DROP CONSTRAINT IF EXISTS launchpad_tasks_admin_link_url_check;
ALTER TABLE launchpad_tasks
  ADD CONSTRAINT launchpad_tasks_admin_link_url_check
  CHECK (
    task_source <> 'admin_link'
    OR (target_url IS NOT NULL AND btrim(target_url) <> '')
  );

-- Yeni task kind (sadece admin link taskleri)
ALTER TABLE launchpad_tasks DROP CONSTRAINT IF EXISTS launchpad_tasks_task_kind_check;
ALTER TABLE launchpad_tasks ADD CONSTRAINT launchpad_tasks_task_kind_check
  CHECK (task_kind = ANY (ARRAY[
    'DAILY'::text, 'ONE_TIME'::text, 'MILESTONE'::text, 'ADMIN_LINK'::text
  ]));