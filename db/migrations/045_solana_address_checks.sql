-- Solana base58 mints/traders are case-sensitive; drop EVM-only lowercase CHECK on launchpad tables.

ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_address_check;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_creator_address_check;

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_trader_address_check;

ALTER TABLE user_positions DROP CONSTRAINT IF EXISTS user_positions_address_check;

ALTER TABLE token_candles DROP CONSTRAINT IF EXISTS token_candles_address_check;

ALTER TABLE referral_bindings DROP CONSTRAINT IF EXISTS referral_bindings_invitee_address_check;
ALTER TABLE referral_bindings DROP CONSTRAINT IF EXISTS referral_bindings_referrer_address_check;

COMMENT ON TABLE tokens IS 'Token registry; address is base58 (Solana) or 0x lowercase (EVM).';
