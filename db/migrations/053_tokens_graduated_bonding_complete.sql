-- Mode-switch: GRADUATED token status + bonding curve_complete / vault snapshot for WS/API.

ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_status_check;
ALTER TABLE tokens ADD CONSTRAINT tokens_status_check CHECK (
  status = ANY (ARRAY['BONDING'::text, 'PAUSED'::text, 'FAILED'::text, 'GRADUATED'::text])
);

ALTER TABLE bonding_states
  ADD COLUMN IF NOT EXISTS curve_complete boolean NOT NULL DEFAULT false;

ALTER TABLE bonding_states
  ADD COLUMN IF NOT EXISTS vault_token_reserve numeric(78, 18);

COMMENT ON COLUMN bonding_states.curve_complete IS 'Solana: complete=1 (AMM phase). EVM: unused.';
COMMENT ON COLUMN bonding_states.vault_token_reserve IS 'Tokens remaining in launchpad vault (human whole tokens).';

-- Backfill tokens that already hit bonding cap before GRADUATED status existed.
UPDATE bonding_states
SET curve_complete = true,
    progress_bps = 10000
WHERE progress_bps >= 10000
   OR COALESCE(token_sold, 0) >= 793100000;

UPDATE tokens t
SET status = 'GRADUATED',
    updated_at = now()
FROM bonding_states b
WHERE t.address = b.token_address
  AND t.status = 'BONDING'
  AND (b.curve_complete = true OR b.progress_bps >= 10000);
