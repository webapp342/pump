-- Weekly clan system (static metadata in PG; XP in Redis ZSET).

CREATE TABLE IF NOT EXISTS clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  leader_address text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clans_name_len CHECK (char_length(name) BETWEEN 2 AND 48),
  CONSTRAINT clans_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$')
);

CREATE INDEX IF NOT EXISTS clans_leader_address_idx ON clans (leader_address);

CREATE TABLE IF NOT EXISTS clan_members (
  clan_id uuid NOT NULL REFERENCES clans (id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clan_id, wallet_address),
  CONSTRAINT clan_members_role CHECK (role IN ('leader', 'officer', 'member'))
);

CREATE UNIQUE INDEX IF NOT EXISTS clan_members_wallet_unique ON clan_members (wallet_address);

CREATE TABLE IF NOT EXISTS season_settlement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT season_settlement_runs_status CHECK (
    status IN ('pending', 'running', 'completed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS season_settlement_runs_season_idx
  ON season_settlement_runs (season_id DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON clans, clan_members TO pump_app;
GRANT SELECT, INSERT, UPDATE ON season_settlement_runs TO pump_app;
GRANT SELECT ON clans, clan_members TO pump_indexer;
