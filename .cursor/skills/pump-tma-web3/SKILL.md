---
name: pump-tma-web3
description: >-
  Web3 patterns for pump-tma: wagmi 2, viem 2, Reown AppKit, BSC chain config,
  contract ABIs, and transaction flows. Use when adding wallet connect, on-chain
  reads/writes, token approvals, or bonding-curve interactions. For AA / session
  keys / popup-free writes, see pump-tma-account-abstraction.
---

# Pump TMA — Web3

## Stack

- **wagmi** 2 + **viem** 2 + **@reown/appkit** 2
- **@tanstack/react-query** via `Web3Provider` (`src/components/wallet/Web3Provider.tsx`)
- Chain: `pumpChain` from `src/config/chain.ts` (BSC testnet by default, `NEXT_PUBLIC_CHAIN_ID`)

## Config

| Item | Location |
|------|----------|
| wagmi config | `src/lib/appkit.ts` — `WagmiAdapter`, single chain, `ssr: true` |
| Contract addresses | `src/config/chain.ts` → `contracts` (`memeFactory`, `bondingCurveManager`, `airdropManager`) |
| ABIs | `src/lib/abis/*.ts` |
| Wallet UI | `WalletBar` + Reown AppKit; theme from `getAppKitThemeOptions` |

Env: `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_MEME_FACTORY`, etc.

## Client-only

All wagmi hooks require `"use client"`. Root `Web3Provider` wraps the app in `layout.tsx`.

## Read patterns

```ts
import { useReadContract, useReadContracts } from "wagmi";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";

const { data } = useReadContract({
  address: contracts.memeFactory,
  abi: memeFactoryAbi,
  functionName: "createFee",
});
```

- Batch reads: `useReadContracts` (see `CreateAirdropForm.tsx`, admin modals)
- Account: `useAccount()` for `address`, `isConnected`, `chain`

## Write patterns

```ts
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";

const { writeContract, data: txHash, isPending, reset } = useWriteContract();
const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

writeContract({
  address: contracts.memeFactory,
  abi: memeFactoryAbi,
  functionName: "createMeme",
  args: [...],
  value: parseEther("0.01"),
});
```

Follow existing forms: pending → confirming → success states; call `reset()` when closing modals.

## Addresses & explorers

- Normalize: `normalizeAddressParam` from `src/lib/address.ts`
- Display: `shortAddress` from `src/config/chain.ts`
- Links: `explorerTxUrl`, `explorerAddressUrl`

## Off-chain data

Indexed trades, holders, and airdrop state live in PostgreSQL (`src/lib/db/`). Prefer DB for lists/charts; use on-chain reads for live balances, allowances, and writes.

## Charts

Token price charts: `lightweight-charts` with trade data from API routes — not wagmi.

## Docs lookup

Use `research-verified` — Context7: `/wevm/wagmi`, `/wevm/viem`.  
**Account Abstraction (hedef):** `pump-tma-account-abstraction` + `.cursor/docs/seamless-web3-ux-research-2026.md`

## Do not

- Add ethers.js — viem only
- Hardcode chain ID or RPC — use `pumpChain` and env
- Put private keys or mnemonics in client code
- Skip `useWaitForTransactionReceipt` after writes when UI depends on confirmation
