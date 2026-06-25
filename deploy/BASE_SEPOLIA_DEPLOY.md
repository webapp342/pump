# Base Sepolia — sıfırdan deploy

Chain **84532** · Explorer: [sepolia.basescan.org](https://sepolia.basescan.org)

## 0) Önkoşullar

```bash
cd contracts

# İlk kez (forge-std)
forge install foundry-rs/forge-std --no-commit

# OpenZeppelin (submodule yoksa)
git submodule update --init --recursive
```

Sepolia ETH: [Base Sepolia faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)

## 1) Env

```bash
export RPC_URL="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
export DEPLOYER_PRIVATE_KEY="0x..."
export LAUNCHPAD_OWNER_ADDRESS="0x..."   # admin / factory owner
```

PowerShell:

```powershell
$env:RPC_URL = "https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
$env:DEPLOYER_PRIVATE_KEY = "0x..."
$env:LAUNCHPAD_OWNER_ADDRESS = "0x..."
```

## 2) Pump stack deploy

```bash
cd contracts

forge script script/DeployPumpBaseSepolia.s.sol:DeployPumpBaseSepolia \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvv
```

Çıktı: `contracts/deployments/base-sepolia-launchpad.json`

## 3) Airdrop (opsiyonel)

```bash
export AIRDROP_KEEPER_ADDRESS="0x..."   # opsiyonel, default = deployer

forge script script/DeployAirdropBaseSepolia.s.sol:DeployAirdropBaseSepolia \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvv
```

Çıktı: `contracts/deployments/base-sepolia-airdrop.json`

## 4) Verify (opsiyonel)

```bash
export BASESCAN_API_KEY="..."

forge verify-contract <IMPL_ADDRESS> src/BondingCurveManager.sol:BondingCurveManager \
  --chain-id 84532 --watch
```

## 5) Web `.env`

`base-sepolia-launchpad.json` adreslerini kopyala:

```env
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_MEME_FACTORY=<memeFactory>
NEXT_PUBLIC_BONDING_CURVE_MANAGER=<bondingCurveManager>
NEXT_PUBLIC_AIRDROP_MANAGER=<pumpAirdropManager>
```

## 6) Indexer DB — contract_registry

`db/scripts/seed_base_sepolia_registry.sql` içinde placeholder'ları doldur, sonra:

```bash
psql -d pump_db -f db/scripts/seed_base_sepolia_registry.sql
```

`INDEXER_START_BLOCK` = deploy JSON'daki `deploymentBlock` (veya biraz öncesi).

## 7) Indexer `.env`

`apps/indexer/.env.example` → `.env` kopyala, `RPC_URL` + `CHAIN_ID=84532` ayarla.

```bash
npm run build --workspace @pump/indexer
pm2 restart pump-indexer
```

## PowerShell tek blok

```powershell
cd C:\Users\DARK\Desktop\pump-tma\contracts
$env:RPC_URL = "https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
$env:DEPLOYER_PRIVATE_KEY = "0x..."
$env:LAUNCHPAD_OWNER_ADDRESS = "0x..."

forge script script/DeployPumpBaseSepolia.s.sol:DeployPumpBaseSepolia --rpc-url $env:RPC_URL --broadcast -vvv
forge script script/DeployAirdropBaseSepolia.s.sol:DeployAirdropBaseSepolia --rpc-url $env:RPC_URL --broadcast -vvv
```

## Kaldırılanlar

- `DeployPumpBsc.s.sol`, `DeployAirdropBsc.s.sol`
- `zugchain-launchpad*.json`, `bsc-testnet-*.json`
- BSC verify script

Odak: **Base Sepolia** (`84532`).
