# Pump.fun vs Pump TMA (Solana) — architecture compare

Target: **pump.fun bonding-curve math** (create + buy/sell), with intentional differences:

- **No graduation** (`complete` never set; no `migrate`)
- **Fee / treasury model = Base Sepolia `BondingCurveManager`** (not pump.fun fee program)

Sources:
- [pump-public-docs](https://github.com/pump-fun/pump-public-docs)
- [@pump-fun/pump-sdk bondingCurve.ts](https://www.npmjs.com/package/@pump-fun/pump-sdk)
- `contracts/src/BondingCurveManager.sol` + `LaunchpadTreasury.sol`

## Product differences (intentional)

| Concern | pump.fun | Pump TMA (Solana) |
|---|---|---|
| Graduation / migrate to AMM | Yes (PumpAMM) | **No** — permanent curve until real tokens depleted |
| SOL custody | Per-curve | **One shared `vault` PDA** (Base manager balance) |
| Protocol fee | Dynamic / fee program | Immediate → `protocol-treasury` PDA |
| Creator / referrer fee | Their fee program | **Pending PDAs + claim** (Base `pendingCreatorFees` / `claim*`) |
| Emergency withdraw | N/A | `emergency_sweep` (Base `emergencySweepAllEth`) |
| Create platform fee | 0 SOL | 0 SOL |
| Program ownership | Theirs (`6EF8…`) | **Ours** |

## On-chain state

**Global** (PDA `["global"]`):

- pump.fun reserve defaults + fee BPS  
- `liquidity` + `protocol_treasury` pubkeys + bumps  
- `emergency_halt`

**Liquidity vault** (PDA `["vault"]`):

- All curve SOL + unclaimed creator/referrer pending balances  

**Protocol treasury** (PDA `["protocol-treasury"]`):

- Protocol fee sink (Base `LaunchpadTreasury`)  

**Bonding curve** (PDA `["curve", mint]`):

- Virtual/real reserves accounting only (SOL does **not** live on curve)  
- `complete` = always 0  

**Pending fees** (PDA `["creator-fees", owner]` / `["referrer-fees", owner]`):

- Accrued lamports until `claim_creator_fees` / `claim_referrer_fees`  

## Math (official pump.fun SDK)

```
buy:  tokens = netSol * vToken / (vSol + netSol)
      tokens = min(tokens, realTokenReserves)
sell: sol    = tokens * vSol / (vToken + tokens)
      sol    = min(sol, realSolReserves)
```

On each trade, **both** virtual and real reserves move by the same amounts (pump.fun docs).

## Create flow

1. Client: mint + Metaplex + curve PDA + vault ATA (**owner = liquidity PDA**)  
2. Program `create_meme`: MintTo vault (`token_total_supply`), init curve from Global  
3. Optional same-tx buy  

## Buy / sell

- Buy: `(sol_in, min_token_out)` — fee from SOL, net into **liquidity**, tokens from vault  
- Sell: `(token_in, min_sol_out)` — tokens to vault, SOL out from **liquidity** after fee  
- Fee split: creator/referrer **accrue pending**; protocol → treasury immediately  

## Deploy after this upgrade

Layout change — old Global/Curve accounts **incompatible**.

```bash
# WSL
cd /mnt/c/Users/DARK/Desktop/pump-tma
bash scripts/solana/wsl-pinocchio-build.sh
bash scripts/solana/wsl-pinocchio-deploy.sh
npm run solana:initialize   # liquidity + protocol_treasury + Global
```

Then deploy web + indexer-sol. **Create a new token** to smoke-test (old mints stay on old layout).

Smoke: create → buy → Earnings pending > 0 → Claim → (authority) emergency_sweep.

## Enterprise Solana stack (Base Alto analogue)

| Base (EVM) | Solana |
|---|---|
| Alto + Kernel SCW | Silent custodial keypair |
| Receipt logs | Program log events → indexer-sol |
| Rooms `token:0x` | Rooms preserve base58 |
