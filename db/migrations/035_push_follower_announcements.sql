-- Follower callout / announcement pushes (default on).

ALTER TABLE public.push_preferences
  ADD COLUMN IF NOT EXISTS follower_announcements boolean NOT NULL DEFAULT true;
