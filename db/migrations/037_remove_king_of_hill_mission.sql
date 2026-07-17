-- Remove King of the Hill rewards mission (Arena KOTH / king_history unchanged).

DELETE FROM launchpad_user_task_completions
WHERE task_key = 'LAUNCHPAD_KING_OF_HILL';

DELETE FROM launchpad_points_sync_log
WHERE task_key = 'LAUNCHPAD_KING_OF_HILL';

DELETE FROM launchpad_tasks
WHERE task_key = 'LAUNCHPAD_KING_OF_HILL';
