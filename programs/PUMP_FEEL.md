# Pump.fun-feel on-chain defaults

Source of truth: `@pump/solana-sdk` → `PUMP_FEEL_DEFAULTS`.

Official pump.fun reference (May 2026): [pump.fun/docs/fees](https://pump.fun/docs/fees)

| Param | Value | Notes |
|-------|-------|--------|
| Create fee | **0 lamports** | Platform fee free; user pays Solana rent + tx only (~0.011 SOL typical) |
| Virtual SOL | 30 SOL | pump.fun-style virtual liquidity |
| Supply | 1B tokens @ 6 decimals | `1_000_000_000 * 10^6` |
| Bonding curve trade fee | **125 bps (1.25%)** | Total fee on each buy/sell |
| Creator share | **2400 bps of fee (0.30% of trade)** | 30/125 of fee pool → creator wallet |
| Protocol share | **9500 bps of fee (0.95% of trade)** | Remainder when no referrer bound |
| Referrer share | **1000 bps of fee (0.10% of trade)** | Only when referrer binding exists; taken from protocol slice |
| Graduation | **None** | Permanent curve — intentional product difference |

## Network costs (not platform fees)

| Action | Typical cost | Notes |
|--------|--------------|--------|
| Create (no buy) | ~0.011 SOL | Mint + curve PDA + vault ATA + Metaplex metadata rent + tx |
| Create + initial buy | ~0.013 SOL + buy amount | Adds trader ATA rent |
| Buy / sell | ~0.000005 SOL tx | Optional priority tip (0.003–0.01 SOL) is user-set on pump.fun; we use base fee only |
| Jito bundle tip | **Not required** | pump.fun optional for snipers; normal trades use standard RPC |

After deploy, re-run `npm run solana:initialize` to write fee defaults to the global PDA.
