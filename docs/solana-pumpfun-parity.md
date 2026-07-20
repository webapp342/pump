# Pump.fun vs Pump TMA (Solana) — architecture compare

Target: **pump.fun bonding-curve parity** (create + buy/sell), with intentional differences only:

- **No graduation** (`complete` never set; no `migrate`)
- **Our fees**: protocol + creator + referral (not pump.fun fee recipients)

Sources:
- [pump-public-docs](https://github.com/pump-fun/pump-public-docs)
- [@pump-fun/pump-sdk bondingCurve.ts](https://www.npmjs.com/package/@pump-fun/pump-sdk)

## Product differences (intentional)

| Concern | pump.fun | Pump TMA |
|---|---|---|
| Graduation / migrate to AMM | Yes (PumpAMM) | **No** — permanent curve until real tokens depleted |
| Protocol fee | Dynamic / fee program | Fixed `protocol_fee_bps` (125) |
| Creator fee | Creator vault / fee program | Share of trade fee → creator wallet |
| Referral fee | Social / volume programs | `referrer` binding PDA share |
| Create platform fee | 0 SOL | 0 SOL |
| Program ownership | Theirs (`6EF8…`) | **Ours** (`Hwv85…`) |

## On-chain state (pump.fun layout)

**Global** (our PDA `["global"]`):

- `initial_virtual_sol_reserves` = 30 SOL  
- `initial_virtual_token_reserves` = 1.073B raw  
- `initial_real_token_reserves` = 793.1M raw  
- `token_total_supply` = 1B raw  
- + our fee BPS fields  

**Bonding curve** (PDA `["curve", mint]`):

- `virtual_token_reserves` / `virtual_sol_reserves`  
- `real_token_reserves` / `real_sol_reserves`  
- `token_total_supply`, `initial_real_token_reserves`  
- `complete` = always 0  

## Math (official SDK)

```
buy:  tokens = netSol * vToken / (vSol + netSol)
      tokens = min(tokens, realTokenReserves)
sell: sol    = tokens * vSol / (vToken + tokens)
      sol    = min(sol, realSolReserves)
```

On each trade, **both** virtual and real reserves move by the same amounts (pump.fun docs).

## Create flow

1. Client: mint + Metaplex + curve PDA + vault ATA (owner = curve)  
2. Program `create_meme`: MintTo vault (`token_total_supply`), init curve from Global  
3. Optional same-tx buy  

## Buy / sell

- Buy: `(sol_in, min_token_out)` — fee from SOL, net into curve, tokens from vault  
- Sell: `(token_in, min_sol_out)` — tokens to vault, SOL out after fee  
- Fee split: creator / referrer / treasury  

## Deploy after this upgrade

Layout change — old Global/Curve accounts **incompatible**.

```bash
# WSL
cd /mnt/c/Users/DARK/Desktop/pump-tma
bash scripts/solana/wsl-pinocchio-build.sh
bash scripts/solana/wsl-pinocchio-deploy.sh
npm run solana:initialize   # writes new Global fields
```

Then deploy web + indexer-sol. **Create a new token** to smoke-test (old mints stay on old layout).

## Enterprise Solana stack (Base Alto analogue)

| Base (EVM) | Solana |
|---|---|
| Alto + Kernel SCW | Silent custodial keypair |
| Receipt logs | Program log events → indexer-sol |
| Rooms `token:0x` | Rooms preserve base58 |
