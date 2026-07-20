-- Repair token_board_stats spot/mcap using bonding_states virtual reserves
-- (EVM reconcile previously hardcoded virtual=5 / supply=1B and broke Solana pump-feel tokens).
UPDATE token_board_stats tbs
SET
  spot_price_zug = CASE
    WHEN (
      COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
    ) > 0
    THEN (
      COALESCE(b.virtual_zug_reserve, 5)::numeric + COALESCE(b.reserve_zug, 0)
    ) / (
      COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
    )
    ELSE tbs.spot_price_zug
  END,
  market_cap_zug = CASE
    WHEN (
      COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
    ) > 0
    THEN (
      (
        COALESCE(b.virtual_zug_reserve, 5)::numeric + COALESCE(b.reserve_zug, 0)
      ) / (
        COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
      )
    ) * 1000000000
    ELSE tbs.market_cap_zug
  END,
  ath_market_cap_zug = GREATEST(
    tbs.ath_market_cap_zug,
    CASE
      WHEN (
        COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
      ) > 0
      THEN (
        (
          COALESCE(b.virtual_zug_reserve, 5)::numeric + COALESCE(b.reserve_zug, 0)
        ) / (
          COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
        )
      ) * 1000000000
      ELSE 0
    END
  ),
  ath_price_zug = GREATEST(
    COALESCE(tbs.ath_price_zug, 0),
    CASE
      WHEN (
        COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
      ) > 0
      THEN (
        COALESCE(b.virtual_zug_reserve, 5)::numeric + COALESCE(b.reserve_zug, 0)
      ) / (
        COALESCE(b.virtual_token_reserve, 1000000000)::numeric - COALESCE(b.token_sold, 0)
      )
      ELSE 0
    END
  ),
  updated_at = now()
FROM bonding_states b
WHERE b.token_address = tbs.token_address;
