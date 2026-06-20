# Account Abstraction — Pump TMA (Haziran 2026)

**Auth:** Telegram Login + Kernel SCW (ZeroDev SDK)  
**Bundler:** **Self-hosted Alto** (open-source, same engine as Pimlico cloud — **no SaaS API key**)  
**Paymaster:** yok — kullanıcı SCW BNB ile gas öder

**Kaynak:** `.cursor/docs/self-hosted-bundler-2026.md` (mimari, Skandha kök neden analizi, ops checklist)

---

## Stack

| Katman | Teknoloji |
|--------|-----------|
| Auth | Telegram Login Widget + session cookie |
| Smart account | ZeroDev Kernel **0.3.1**, EntryPoint **0.7** |
| Bundler | **Alto** self-host (`deploy/bundler/alto/`) |
| Client SDK | `@zerodev/sdk`, viem 2 account-abstraction |
| Chain RPC (reads) | `NEXT_PUBLIC_RPC_URL` (Alchemy free OK — app chunk’lı getLogs) |
| Chain RPC (bundler) | `BUNDLER_CHAIN_RPC_URL` — **paid tier only** |

## Do NOT use

| ❌ | Neden |
|----|--------|
| Pimlico SaaS (`api.pimlico.io` + API key) | Vendor lock-in — hedef self-host |
| Skandha prod | VM’de getLogs death spiral, ms/s config tuzakları |
| Alchemy **free** for bundler RPC | 10 blok getLogs limiti |
| BSC public dataseed for bundler | `limit exceeded` |

## Env

```bash
# Client reads
NEXT_PUBLIC_RPC_URL=https://bnb-testnet.g.alchemy.com/v2/...
NEXT_PUBLIC_CHAIN_ID=97

# Bundler — proxy → Alto on VM
BUNDLER_RPC_URL=http://127.0.0.1:4337/rpc
# NEXT_PUBLIC_BUNDLER_RPC_URL=/api/bundler/rpc  # default

# Alto setup only (VM, not Next.js)
BUNDLER_CHAIN_RPC_URL=https://bnb-testnet.g.alchemy.com/v2/PAYG_KEY
BUNDLER_EXECUTOR_PRIVATE_KEYS=0x...,0x...
BUNDLER_UTILITY_PRIVATE_KEY=0x...
```

## VM deploy

```bash
export BUNDLER_EXECUTOR_PRIVATE_KEYS=0x...
export BUNDLER_UTILITY_PRIVATE_KEY=0x...
export BUNDLER_CHAIN_RPC_URL=https://bnb-testnet.g.alchemy.com/v2/PAYG_KEY
bash deploy/bundler/alto/setup-alto-pm2.sh
pm2 delete pump-skandha 2>/dev/null || true
# TMA .env: BUNDLER_RPC_URL=http://127.0.0.1:4337/rpc
pm2 restart pump-tma
bash deploy/bundler/alto/health.sh
```

## App files

```
src/lib/aa/
  kernel-account.ts       # Kernel client + gas via bundler RPC
  pimlico-gas-price.ts    # pimlico_getUserOperationGasPrice (Alto-compatible RPC name)
  bundler-config.ts       # proxy upstream → BUNDLER_RPC_URL
  bundler-transport.ts
  wait-user-op-confirmation.ts  # bundler receipt OR EntryPoint logs
  send-kernel-transaction.ts
src/app/api/bundler/rpc/route.ts
```

## Gas rules (BSC)

- `pimlico_getUserOperationGasPrice` → standard tier (Alto)
- Fallback min **1 gwei** `maxFeePerGas` and `maxPriorityFeePerGas`
- Never `gasPrice/10` for priority fee on BSC

## Alto BSC flags

- `safe-mode: false` — Kernel (no debug_traceCall RPC required)
- `legacy-transactions: true` — BSC bundle tx type

## Trade path

1. `eth_estimateUserOperationGas` via proxy → Alto
2. `eth_sendUserOperation` → userOpHash
3. `waitForUserOpConfirmation` — receipt + EntryPoint fallback

## Faz

1. ✅ Telegram + Kernel + Pimlico SaaS (geçici POC)
2. **→ Alto self-host** (bu skill)
3. Opsiyonel paymaster / session keys genişletme

## Docs lookup

| Konu | Kaynak |
|------|--------|
| Alto self-host | https://docs.pimlico.io/references/bundler/self-host |
| BSC 97 + Kernel | https://docs.pimlico.io/guides/supported-chains |
| ZeroDev Kernel | Context7 `/websites/zerodev_app` |
| ERC-4337 RPC | https://eips.ethereum.org/EIPS/eip-7769 |

## Do not

- EntryPoint 0.6 — **0.7** only
- Paymaster/bundler secrets in client bundle
- Skandha `bundleInterval: 10` thinking it's seconds (it's **ms** — use Alto instead)
