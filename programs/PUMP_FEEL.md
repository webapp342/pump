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

## Liquidity + fees (Base Sepolia BondingCurveManager parity)

Not pump.fun fee recipients — **our** Base EVM model:

| Concern | Behaviour |
|---------|-----------|
| SOL liquidity | One shared `vault` PDA (`liquidity`) — all curve SOL + pending claimable fees |
| Token vault ATA | Owned by **liquidity** PDA (not per-curve) |
| Protocol fee | Paid **immediately** to `protocol-treasury` PDA |
| Creator / referrer | Accrue in `creator-fees` / `referrer-fees` PDAs — **claim required** |
| Protocol withdraw | `withdraw_protocol_treasury` (authority) |
| Emergency | `emergency_sweep` drains liquidity vault + sets halt (Base `emergencySweepAllEth`) |

| Param | Value | Notes |
|-------|-------|--------|
| Create fee | **0 lamports** | User pays Solana rent + tx only |
| Trade fee | **125 bps (1.25%)** | Taken from SOL in / SOL out |
| Creator share | **2400 bps of fee** | Accrues pending — claim via UI |
| Referrer share | **1000 bps of fee** | Accrues pending when binding exists |
| Protocol | Remainder of fee | → protocol treasury |

Pending fee PDAs are funded with **1,300,000 lamports**. The 48-byte
rent-exempt minimum is currently 1,224,960 lamports; funding below it makes
non-dust trades fail at runtime when the first claimable fee is accrued.

## Network costs (not platform fees)

| Action | Typical cost | Notes |
|--------|--------------|--------|
| Create (no buy) | ~0.007–0.011 SOL | Mint + vault ATA + Metaplex + curve rent + tx |
| Buy / sell | ~0.000005 SOL tx | Live via `getFeeForMessage` |

## Deploy / upgrade

After program upgrade (layout change), **re-run initialize** so Global has liquidity + protocol treasury + pump.fun reserve fields:

```bash
bash scripts/solana/wsl-pinocchio-build.sh
bash scripts/solana/wsl-pinocchio-deploy.sh
npm run solana:initialize
```

`initialize` accounts: authority, **liquidity**, **protocol_treasury**, factory_signer, global, system.

Old tokens / Global from before this layout **will not decode** — create new coins after upgrade. Redeploy web + indexer-sol.

## Admin console (Solana)

- Overview / Treasury / Contracts read **on-chain Solana** balances (liquidity vault + protocol treasury PDAs).
- **Withdraw** → `withdraw_protocol_treasury` (server-signed with Global.authority keypair).
- **Emergency pending fees** → `emergency_claim_pending_fees` (IX 9) zeros a creator/referrer PendingFees PDA and pays SOL from the **liquidity vault** to a recipient (not protocol treasury). Requires program upgrade that includes IX 9.
- **Emergency sweep** → `emergency_sweep` → drains entire liquidity vault + halts trading; recipient defaults to **Global.authority** (deployer). Do not use this for pending-fee recovery.
- Env on the API host (required; do not rely on missing `~/.config/solana/id.json`):
  1. `SOLANA_AUTHORITY_SECRET_BASE64` — preferred, or
  2. `SOLANA_AUTHORITY_KEYPAIR` / `ANCHOR_WALLET` — path to keygen JSON matching `GlobalConfig.authority`
- Login gate remains MetaMask `NEXT_PUBLIC_ADMIN_ADDRESS` (ops SIWE); on-chain txs use the Solana authority key.

### Ops checklist (emergency pending fees)

1. Build + upgrade program (`wsl-pinocchio-build.sh` / `wsl-pinocchio-deploy.sh`) so IX 9 is live.
2. Deploy web (API routes + Treasury UI).
3. Confirm authority env on the VM (see above).
4. Smoke: small pending on a creator/referrer PDA → Admin Treasury → Sweep → pending drops, recipient balance rises.
