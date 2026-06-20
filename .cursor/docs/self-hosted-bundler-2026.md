# Self-Hosted ERC-4337 Bundler — Pump TMA (Haziran 2026)

**Amaç:** Pimlico **SaaS bağımlılığı olmadan**, şu an Pimlico ile çalışan kadar güvenilir kendi bundler altyapımız.

**Karar (2026-06):** **Alto** (Pimlico’nun açık kaynak bundler’ı) + **ücretli chain RPC** + mevcut Next.js proxy + client dual-confirm.

Kaynaklar:
- [Alto repo](https://github.com/pimlicolabs/alto) (GPL-3.0)
- [Alto self-host guide](https://docs.pimlico.io/references/bundler/self-host)
- [Pimlico supported chains — BSC testnet 97](https://docs.pimlico.io/guides/supported-chains) (EP v0.7 + Kernel 0.3.1 ✅)
- [Rundler](https://github.com/alchemyplatform/rundler) (alternatif, Rust)
- [Skandha v0.7](https://github.com/etherspot/skandha/tree/releases/v0.7) (denendi — **prod önerilmez**, aşağıda kök nedenler)
- [ERC-7769 bundler JSON-RPC](https://eips.ethereum.org/EIPS/eip-7769)

---

## 1. Pimlico SaaS neden sorunsuz?

| Katman | Pimlico cloud |
|--------|----------------|
| Bundler | **Alto** — aynı kod tabanı, prod-hardened |
| Chain RPC | Kendi sınırsız/getLogs-safe node’ları |
| Gas fiyatı | `pimlico_getUserOperationGasPrice` (min priority fee kuralları dahil) |
| Receipt | `eth_getUserOperationReceipt` — doğru pending/null semantiği |
| Ops | Executor wallet refill, mempool, monitoring |

Bizde Skandha patladı çünkü **bundler yazılımı + ücretsiz RPC + yanlış config** üçlüsü bir araya geldi — Pimlico’nun “sihri” değil.

**Vendor-free hedef:** Pimlico **API key’i değil**, Alto’yu **kendi VM’de** çalıştırmak. RPC method isimleri (`pimlico_getUserOperationGasPrice`) Alto’da da var — bu Pimlico SaaS bağımlılığı sayılmaz.

---

## 2. Seçenek karşılaştırması (Haziran 2026)

| | **Alto** ⭐ | Rundler | Skandha |
|---|-----------|---------|---------|
| Dil | TypeScript | Rust | TypeScript (Bun) |
| EP 0.7 + Kernel 0.3.1 BSC 97 | ✅ resmi destek | ✅ | ✅ (unsafeMode) |
| Pimlico ile aynı RPC yüzeyi | ✅ | Kısmen (7769 standart) | Kısmen |
| Prod kanıtı | Pimlico + birçok ekip self-host | Alchemy prod | Etherspot; bizde kötü ops deneyimi |
| BSC uyumu | `--legacy-transactions` | chain config | `eip1559: false`, classic relayer |
| Kurulum | pnpm build / Docker | Docker ağırlıklı | bun + bcrypto native |
| RAM (tek instance) | ~300–600 MB | ~200–400 MB | ~260 MB |
| Lisans | GPL-3.0 | Apache-2.0 | GPL-3.0 |

**Öneri:** **Alto** — app kodu (`pimlico-gas-price.ts`, proxy, EP 0.7) neredeyse sıfır değişiklik.

**Skandha’yı neden bıraktık (köken analizi):**

| Hata | Sonuç |
|------|--------|
| `bundleInterval: 10` = **10 ms** (Skandha ms kullanır; 10 sn = `10000`) | Relayer spam, mempool kilit |
| `rpcEndpoint` = Alchemy **free** | `eth_getLogs` max 10 blok → receipt/poll death spiral |
| `rpcEndpoint` = dataseed | `limit exceeded` geniş getLogs |
| EventsService `fromBlock→latest` + stuck Submitted ops | Sonsuz `-32005` / Alchemy 400 |
| `receiptLookupRange` off-by-one | 10 config = 11 blok taraması |
| Priority fee 0.1 gwei (client) | Pimlico/Alto min 1 gwei |

Alto bu sınıfların çoğunu prod kodda çözer; yine de **ücretli RPC şart**.

---

## 3. Hedef mimari (Pump VM)

```
Browser (Kernel SCW)
    │  eth_sendUserOperation / estimate / receipt
    ▼
Next.js  /api/bundler/rpc  (same-origin proxy, API key gizli)
    ▼
Alto 127.0.0.1:4337  (PM2 veya Docker)
    │  handleOps bundle
    ├─► Chain RPC (DEDICATED, paid)  ← read + submit + getLogs
    └─► Executor EOA pool (test BNB / mainnet BNB)
```

**Paralel (client):** `wait-user-op-confirmation.ts` — bundler receipt **veya** EntryPoint `UserOperationEvent` (Alchemy chunked getLogs, 10 blok limiti).

**Indexer / TMA read RPC:** bundler RPC’den **ayrı** URL (arena, chart) — bundler node’u sadece bundler’a.

---

## 4. Zorunlu bileşenler

### 4.1 Chain RPC (bundler-dedicated)

| | Kabul | Red |
|---|------|-----|
| Alchemy **PAYG** / Growth | ✅ sınırsız getLogs aralığı | |
| QuickNode / Chainstack paid | ✅ | |
| Alchemy **Free** | | ❌ 10 blok getLogs |
| BSC public dataseed | | ❌ limit exceeded |
| PublicNode archive | | ❌ 403 |

Env: `BUNDLER_CHAIN_RPC_URL` — sadece Alto’ya verilir, app `NEXT_PUBLIC_RPC_URL` ayrı kalır.

### 4.2 Alto config (BSC testnet 97)

```json
{
  "entrypoints": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "executor-private-keys": "0x...,0x...",
  "utility-private-key": "0x...",
  "rpc-url": "https://bnb-testnet.g.alchemy.com/v2/PAYG_KEY",
  "safe-mode": false,
  "legacy-transactions": true,
  "network-name": "binance-testnet"
}
```

- **`safe-mode: false`** — Kernel için Skandha `--unsafeMode` ile aynı mantık; `debug_traceCall` zorunluluğu yok.
- **`legacy-transactions: true`** — BSC bundle tx tipi ([Alto compat](https://docs.pimlico.io/references/bundler/self-host)).
- **2+ executor key** — paralel bundle, biri kilitlenince diğeri devam.
- **utility wallet** — executor balance auto-refill (Alto built-in).

### 4.3 Pump app env

```bash
# VM + local — Alto upstream (Skandha/Pimlico SaaS YOK)
BUNDLER_RPC_URL=http://127.0.0.1:4337/rpc
PIMLICO_API_KEY=          # BOŞ — SaaS kullanma
BUNDLER_CHAIN_RPC_URL=      # sadece Alto setup script’inde

NEXT_PUBLIC_RPC_URL=        # client reads (Alchemy free OK for narrow getLogs — app chunk’lı)
```

Client default: `/api/bundler/rpc` → proxy → Alto.

Gas: `src/lib/aa/pimlico-gas-price.ts` → `pimlico_getUserOperationGasPrice` (Alto’da aynı method).

### 4.4 Monitoring (SLO)

| Alarm | Eşik |
|-------|------|
| Alto process down | PM2 restart > 3 / 5 dk |
| Executor balance | < 0.05 tBNB |
| `eth_sendUserOperation` error rate | > 5% / 10 dk |
| Receipt timeout (app) | P95 > 60 s |
| Chain RPC latency | P95 > 500 ms |

Haftalık: `docs/ops-perf-playbook.md` ritüeline `deploy/bundler/alto/health.sh` ekle.

---

## 5. Geçiş planı (Pimlico SaaS → Alto self-host)

### Faz A — VM Alto (1 gün)

1. `deploy/bundler/alto/setup-alto-pm2.sh` çalıştır
2. `pm2 stop pump-skandha` — Skandha kapat
3. VM `.env`: `BUNDLER_RPC_URL=http://127.0.0.1:4337/rpc`, `PIMLICO_API_KEY` kaldır
4. `pm2 restart pump-tma`
5. Test: estimate → send → receipt < 30 s

### Faz B — Stabilizasyon (3–5 gün)

- Executor wallet faucet + utility refill doğrula
- Load: 10 ardışık buy, receipt P95 ölç
- Log: Alto + TMA `[pump:bundler]` + `[pump:trade]`

### Faz C — Prod hardening

- Mainnet: slug `bsc`, executor mainnet BNB
- Rate limit `/api/bundler/rpc` (abuse)
- Ops runbook: `docs/ops-perf-playbook.md` bundler bölümü

### Faz D — Opsiyonel paymaster

- Alto verifying paymaster veya ayrı servis — gas sponsor (şu an kullanıcı SCW BNB ödüyor)

---

## 6. App kodu — değişiklik minimizasyonu

| Dosya | Durum |
|-------|--------|
| `bundler-config.ts` | Upstream = `BUNDLER_RPC_URL` (Alto) |
| `pimlico-gas-price.ts` | Alto ile uyumlu (method adı aynı) |
| `bundler-rpc-compat.ts` | Skandha pending hata normalize — Alto’da da zararsız |
| `wait-user-op-confirmation.ts` | Dual confirm — **tut** |
| `kernel-account.ts` | Gas floor 1 gwei — **tut** |

**Eklenmemeli (şimdilik):** permissionless SDK — ZeroDev kernel client yeterli; dependency şişirme.

---

## 7. Maliyet tahmini (düşük hacim)

| Kalem | Aylık |
|-------|-------|
| VM (mevcut) | $0 ek |
| Alchemy PAYG (bundler RPC) | ~$5–25 |
| Executor gas (testnet) | faucet |
| Executor gas (mainnet) | kullanıma bağlı |

Pimlico SaaS free tier’dan ucuz olabilir ama **vendor lock-in yok**.

---

## 8. Red flags — tekrarlama

1. Bundler + app **aynı free RPC** — asla
2. Skandha `bundleInterval` saniye sanmak — **ms**
3. Mempool db temizlemeden “restart yeter” — Skandha’da hayalet Submitted ops
4. `maxPriorityFeePerGas` < 1 gwei BSC’de
5. SSH tunnel 14337 (Skandha) — Alto default **4337**

---

## 9. Alternatif yol (Rundler)

Alchemy ekosistemine yakınsan ve Rust/Docker tercih edersen:

- Image: `alchemyplatform/rundler:v0.11.0`
- `NETWORK=bsc-testnet`, `NODE_HTTP=`, `BUILDER_PRIVATE_KEY=`
- App tarafında gas price: chain `eth_gasPrice` + floor (Pimlico method yok)

Daha fazla ops işi; Pump için **Alto öncelik**.

---

## 10. Checklist — “Pimlico kadar sorunsuz”

- [ ] Alto PM2 online, `eth_chainId` → 0x61
- [ ] Paid bundler RPC (getLogs 100+ blok test)
- [ ] `safe-mode: false`, `legacy-transactions: true`
- [ ] 2 executor + utility funded
- [ ] TMA proxy → Alto, SaaS key yok
- [ ] Buy E2E: send → receipt < 30 s (10 ardışık)
- [ ] Skandha PM2 disabled
- [ ] Haftalık health script

---

*Son güncelleme: 2026-06-20 · Pump TMA · EntryPoint 0.7 · Kernel 0.3.1 · BSC testnet 97*
