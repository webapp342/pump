-- Remaining lowercase CHECKs that break Solana base58 (announcements, airdrops, king, creator fees).
-- Idempotent; safe on EVM (constraints already allow lowercase-only rows).

ALTER TABLE token_announcements DROP CONSTRAINT IF EXISTS token_announcements_token_address_check;
ALTER TABLE token_announcements DROP CONSTRAINT IF EXISTS token_announcements_announcer_address_check;

ALTER TABLE airdrops DROP CONSTRAINT IF EXISTS airdrops_creator_address_check;
ALTER TABLE airdrops DROP CONSTRAINT IF EXISTS airdrops_linked_token_check;
ALTER TABLE airdrops DROP CONSTRAINT IF EXISTS airdrops_reward_token_check;

ALTER TABLE king_history DROP CONSTRAINT IF EXISTS king_history_creator_address_check;
ALTER TABLE creator_fee_claims DROP CONSTRAINT IF EXISTS creator_fee_claims_creator_address_check;

ALTER TABLE token_board_stats DROP CONSTRAINT IF EXISTS token_board_stats_token_address_check;
ALTER TABLE bonding_states DROP CONSTRAINT IF EXISTS bonding_states_token_address_check;
ALTER TABLE token_media DROP CONSTRAINT IF EXISTS token_media_token_address_check;

COMMENT ON COLUMN tokens.address IS 'Mint/token address: Solana base58 (case-sensitive) or EVM 0x lowercase';
