-- Telegram user → Kernel SCW mapping (EOA signer stored encrypted server-side)
CREATE TABLE IF NOT EXISTS public.telegram_wallets (
  telegram_id bigint NOT NULL,
  telegram_username text,
  first_name text,
  eoa_address text NOT NULL,
  scw_address text NOT NULL,
  encrypted_private_key text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT telegram_wallets_eoa_address_check CHECK ((eoa_address = lower(eoa_address))),
  CONSTRAINT telegram_wallets_scw_address_check CHECK ((scw_address = lower(scw_address)))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_wallets_pkey'
  ) THEN
    ALTER TABLE ONLY public.telegram_wallets
      ADD CONSTRAINT telegram_wallets_pkey PRIMARY KEY (telegram_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_wallets_scw
  ON public.telegram_wallets (scw_address);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_wallets_eoa
  ON public.telegram_wallets (eoa_address);
