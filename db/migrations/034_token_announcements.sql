-- Token callouts / announcements (pump.fun-style shoutouts)
-- History-friendly: multiple rows per (announcer, token) allowed; soft rate-limit in app.

CREATE TABLE IF NOT EXISTS public.token_announcements (
  id bigserial PRIMARY KEY,
  token_address text NOT NULL
    CONSTRAINT token_announcements_token_address_check CHECK (token_address = lower(token_address)),
  announcer_address text NOT NULL
    CONSTRAINT token_announcements_announcer_address_check CHECK (announcer_address = lower(announcer_address)),
  -- Live FDV (BNB units) at announce time
  market_cap_zug_at_announce numeric NOT NULL
    CONSTRAINT token_announcements_mcap_check CHECK (market_cap_zug_at_announce > 0),
  -- Launch baseline FDV from bonding virtuals (BNB units) at announce time
  launch_mcap_zug numeric NOT NULL
    CONSTRAINT token_announcements_launch_mcap_check CHECK (launch_mcap_zug > 0),
  -- announce_mcap / launch_mcap (e.g. 2.5 means 2.5x since launch)
  multiplier_x numeric NOT NULL
    CONSTRAINT token_announcements_multiplier_check CHECK (multiplier_x > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT token_announcements_token_fkey
    FOREIGN KEY (token_address) REFERENCES public.tokens(address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_token_announcements_token_created
  ON public.token_announcements (token_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_announcements_announcer_created
  ON public.token_announcements (announcer_address, created_at DESC);

-- Keep wipe_launchpad_app_data in sync when that function is recreated in later ops scripts.
-- Prefer TRUNCATE token_announcements before tokens when wiping.
