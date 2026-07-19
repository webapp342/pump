# Pump.fun-feel on-chain defaults

Source of truth: `@pump/solana-sdk` → `PUMP_FEEL_DEFAULTS`.

| Param | Value | Notes |
|-------|-------|--------|
| Create fee | 0 lamports | Free launch; user pays rent + tx only |
| Virtual SOL | 30 SOL | Similar to pump.fun virtual liquidity |
| Supply | 1B tokens @ 6 decimals | `1_000_000_000 * 10^6` |
| Protocol fee | 100 bps (1%) | On each buy/sell |
| Creator share of fee | 50% | Of protocol fee cut |
| Referrer share | 10% (20% verified later) | Of protocol fee cut |

When deploying:

```text
pump_factory::initialize(
  create_fee = 0,
  virtual_sol = 30_000_000_000,
  virtual_token = 1_000_000_000_000_000,
  total_supply = 1_000_000_000_000_000,
  decimals = 6,
)

pump_curve::initialize(
  protocol_fee_bps = 100,
  creator_fee_share_bps = 5000,
  referrer_share_bps = 1000,
  verified_referrer_share_bps = 2000,
)
```

No graduation (permanent curve) — intentional product difference from pump.fun migrate.
