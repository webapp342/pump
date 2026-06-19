---
name: pump-tma-account-abstraction
description: >-
  Account Abstraction patterns for pump-tma: Privy auth, ZeroDev Kernel session
  keys, Pimlico bundler/paymaster, popup-free trades on BSC. Use when implementing
  smart wallets, session grants, gas sponsorship, or migrating from AppKit EOA writes.
---

# Pump TMA — Account Abstraction

**Araştırma kaynağı:** `.cursor/docs/seamless-web3-ux-research-2026.md` (Haziran 2026)

## Hedef stack

| Katman | Teknoloji |
|--------|-----------|
| Auth + signer | Privy embedded wallet (email/social/passkey) |
| Smart account | ZeroDev Kernel v3, EntryPoint **0.7** |
| Bundler + paymaster | Pimlico (`bsc` / chain `97`) |
| Client SDK | `permissionless`, `@zerodev/sdk`, `@zerodev/permissions` |
| Reads | wagmi 2 + viem 2 (mevcut — değiştirme) |
| Writes | `SmartAccountClient` / session key — **AppKit `useWriteContract` yerine** |

## Mevcut → hedef

| Bugün | Hedef |
|-------|-------|
| Reown AppKit → EOA | Privy → Kernel SCW |
| `useWriteContract` → popup | Session key UserOp → popup yok |
| Kullanıcı BNB gas | Paymaster sponsor (opsiyonel) |
| `useAccount().address` = EOA | SCW adresi; bootstrap buna göre |

**Kod referansları:** `src/lib/wagmi.ts`, `PumpWalletProvider.tsx`, `TradePanel.tsx`, `CreateMemeForm.tsx`, `CreateAirdropForm.tsx`

## Dosya yapısı (hedef)

```
src/lib/aa/
  kernel-account.ts       # createKernelAccount + Privy signer + KernelEIP1193Provider
  session-permissions.ts  # bondingCurveManager / memeFactory whitelist
  pimlico-client.ts       # bundler URL (public fallback + NEXT_PUBLIC_PIMLICO_API_KEY)
  session-storage.ts      # serializePermissionAccount / localStorage
src/hooks/
  useSessionTrade.ts      # session-key buy POC + withdraw helper
src/components/wallet/
  Web3Provider.tsx        # PrivyProvider + @privy-io/wagmi
  PumpWalletProvider.tsx  # SCW address, session grant, logout
  SmartAccountConnectorSetup.tsx  # useEmbeddedSmartAccountConnector → Kernel
  SessionGrantModal.tsx   # "Bir daha sorma" UX
```

## Implementation notes (2026-06-19 Phase 1)

- **Removed:** `@reown/appkit`, `@reown/appkit-adapter-wagmi`, `src/lib/appkit.ts`, WalletConnect project ID
- **wagmi config:** `src/lib/wagmi.ts` via `@privy-io/wagmi` `createConfig` (not vanilla wagmi adapter)
- **SCW in wagmi:** `useEmbeddedSmartAccountConnector` + `KernelEIP1193Provider` — `useAccount().address` = SCW
- **ZeroDev imports:** `getEntryPoint`, `KERNEL_V3_1` from `@zerodev/sdk/constants` (not root export)
- **npm:** install AA deps with `--legacy-peer-deps` (permissionless `ox` peer vs viem)
- **Pimlico:** `NEXT_PUBLIC_PIMLICO_API_KEY` optional; falls back to `public.pimlico.io` for dev
- **Session grant:** `serializePermissionAccount` triggers master enable signature (Privy/OS prompt, 1×)
- **Trade POC:** `TradePanel` **buy** only via `useSessionTrade`; sell/create still `useWriteContract`
- **Withdraw:** session `sendTransaction` — may need broader native-send call policy (TODO)
- **On-ramp:** AppKit on-ramp removed; card buy = Privy dashboard funding (placeholder alert for now)
- **Missing keys:** `PumpWalletProviderStub` + vanilla `wagmi` `WagmiProvider` when Privy unset; `@privy-io/wagmi` only inside `PrivyProvider`


## Env

```bash
# Client
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_PIMLICO_API_KEY=   # optional dev; server proxy in prod
NEXT_PUBLIC_CHAIN_ID=97

# Server only — ASLA client bundle
PRIVY_APP_SECRET=
PIMLICO_API_KEY=
PAYMASTER_DAILY_BUDGET_USD=
```

Pimlico URL örnekleri:
- Testnet: `https://api.pimlico.io/v2/97/rpc?apikey=...`
- Mainnet: `https://api.pimlico.io/v2/bsc/rpc?apikey=...`

Public prototip: `https://public.pimlico.io/v2/97/rpc`

## Session permissions (Pump scope)

Whitelist — `src/config/chain.ts` → `contracts`:

- `memeFactory` — createMeme, vb.
- `bondingCurveManager` — buy, sell, buyWithReferrer, sellWithPermit, vb.
- `airdropManager` — create campaign writes

Policy set (ZeroDev `@zerodev/permissions`):

1. **Call policy** — sadece yukarıdaki kontratlar + izinli selector'lar
2. **Gas policy** — max gas per UserOp
3. **Rate limit** — saatlik tx cap
4. **Timestamp** — 7 gün default expiry
5. **Paymaster required** — session key'de gas drain koruması

POC gerekli: selector listesi kontrat ABI'den çıkarılmalı.

## Akış kalıpları

### 1. Smart account init (Privy login sonrası)

```typescript
// Privy embedded wallet → Kernel account
// Context7: /websites/privy_io — custom-implementation recipe
// Context7: /websites/zerodev_app — createKernelAccount

const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
const provider = await embeddedWallet.getEthereumProvider();
// → signerToEcdsaValidator → createKernelAccount → createSmartAccountClient
```

### 2. Session grant ("bir daha sorma")

```typescript
// Master (Privy) bir kez imzalar → serializePermissionAccount → session-storage
// Sonraki tx'ler session key account client ile
```

UI: `SessionGrantModal` — checkbox + süre seçimi; master imza = OS biyometrik (kabul edilebilir).

### 3. Trade write (session path)

```typescript
await smartAccountClient.sendTransaction({
  calls: [{
    to: contracts.bondingCurveManager,
    data: encodeFunctionData({ abi: bondingCurveManagerAbi, functionName: "buy", args }),
    value: bnbWei,
  }],
});
// Paymaster: pimlicoClient sponsor
// UI: isPending → waitForUserOperationReceipt (useWriteContract + useWaitForTransactionReceipt yerine)
```

### 4. Batch (create + initial buy)

```typescript
await smartAccountClient.sendCalls({
  calls: [createMemeCall, initialBuyCall],
});
```

Permit sell: ayrı `signTypedData` popup yerine session key batch tercih et.

## UI kuralları

- **price-accuracy-contract:** Quote UI "Est." prefix korunur; fill tape on-chain — AA değiştirmez
- Pending states: mevcut `TradePanel` isPending/isConfirming pattern'i koru
- Yetersiz BNB: `WalletFundingModal` (Deposit / on-ramp) — SCW adresine yönlendir
- `UserBootstrapProvider`: `address` = **SCW adresi** (EOA değil)

## Güvenlik checklist

- [ ] Session key localStorage — CSP + XSS audit
- [ ] Paymaster webhook: kontrat whitelist + günlük budget
- [ ] Session TTL + revoke UI (Settings)
- [ ] API key'ler server-side only
- [ ] Legacy EOA path varsa migration banner

## Popup matrisi

| Durum | Popup? |
|-------|--------|
| Session key ile buy/sell/create | Hayır |
| İlk session grant | Evet (master — 1× / TTL) |
| Passkey kayıt | Evet (OS WebAuthn) |
| On-ramp kart | Evet (partner KYC) |
| Harici MetaMask (legacy) | Evet (bilinçli) |

## Faz sırası

1. **POC** — BSC testnet single `buy` UserOp + session key
2. **Beta** — TradePanel + Create forms migration
3. **Mainnet** — production paymaster + abuse limits
4. **Multi-chain** — Particle UA veya ZeroDev CA (araştırma doc Faz 3)

## Docs lookup

| Konu | Context7 ID |
|------|-------------|
| Privy | `/websites/privy_io` |
| ZeroDev | `/websites/zerodev_app` |
| permissionless | `/pimlicolabs/permissionless.js` |
| wagmi (reads) | `/wevm/wagmi` |

`research-verified` skill — API uydurma; versiyon için `package.json` kontrol et.

## Do not

- AppKit `useWriteContract` ile yeni write flow ekleme (migration hedefi session key)
- EntryPoint 0.6 — **0.7** kullan
- Paymaster API key'i client bundle'a koyma
- Session key'e sudo / unlimited policy verme
- Spot/quote/fill semantiğini AA ile karıştırma — `.cursor/docs/price-accuracy-contract.md`
