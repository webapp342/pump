# Pump.fun-feel on-chain defaults

Source of truth: `@pump/solana-sdk` → `PUMP_FEEL_DEFAULTS`.

Official pump.fun reference:
- [pump-public-docs PUMP_PROGRAM_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md)
- Fees (May 2026): [pump.fun/docs/fees](https://pump.fun/docs/fees)

## Bonding curve (pump.fun parity)

| Param | Value | Notes |
|-------|-------|--------|
| Virtual SOL | 30 SOL | `initial_virtual_sol_reserves` |
| Virtual tokens | 1.073B raw @ 6dp | `initial_virtual_token_reserves` |
| Real tokens (sellable) | 793.1M raw | `initial_real_token_reserves` |
| Total supply (minted to vault) | 1B raw | `token_total_supply` |
| Math | Uniswap V2 on **virtual** reserves | Buy capped by **real** token reserves |
| Graduation | **None** | `complete` never set; no `migrate` |

## Fees (our difference)

| Param | Value | Notes |
|-------|-------|--------|
| Create fee | **0 lamports** | User pays Solana rent + tx only |
| Trade fee | **125 bps (1.25%)** | Taken from SOL in / SOL out |
| Creator share | **2400 bps of fee** | ~0.30% of trade volume |
| Referrer share | **1000 bps of fee** | When binding exists |
| Protocol | Remainder of fee | Treasury PDA |

## Network costs (not platform fees)

| Action | Typical cost | Notes |
|--------|--------------|--------|
| Create (no buy) | ~0.007–0.011 SOL | Mint + vault ATA + Metaplex + curve rent + tx |
| Buy / sell | ~0.000005 SOL tx | Live via `getFeeForMessage` |

## Deploy / upgrade

After program upgrade (layout change), **re-run initialize** so Global has pump.fun reserve fields:

```bash
bash scripts/solana/wsl-pinocchio-build.sh
bash scripts/solana/wsl-pinocchio-deploy.sh
npm run solana:initialize
```

Old tokens created before this layout **will not decode** — create new coins after upgrade.
