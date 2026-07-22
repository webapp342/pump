# Solana bonding → AMM mode-switch — phased rollout (final)

## Karar

**Mode-switch** seçildi (migrate + Pool + LP yok):

- `complete=0` → bonding (virtual CPMM + 793.1M cap)
- `complete=1` → AMM (Uniswap V2 CPMM on `real_sol × vault_tokens`)
- Aynı `buy` / `sell` IX, aynı `accrue_fees`
- Test: `virtualSol = 5 SOL` → ~14.17 SOL net ile flip

---

## Uniswap / Context7 doğrulama

Uniswap V2 core: `x * y = k` ([Uniswap glossary](https://github.com/uniswap/docs/blob/main/docs/concepts/glossary.md)).

Swap output (0.3% LP fee **içinde**):

```text
amountOut = amountIn * 997 * reserveOut / (reserveIn * 1000 + amountIn * 997)
```

Bizim model **farklı fee yeri**, aynı CPMM gövdesi:

1. `fee = gross * protocol_fee_bps / 10000` (125 bps — bonding ile aynı)
2. `net = gross - fee` SOL havuza girer
3. `tokensOut = net * base / (quote + net)` — Uniswap `getAmountOut` ile aynı iskelet (fee önce kesildi)

Rounding: `amountOut` **floor** (pool-safe); cap-buy inverse **ceil gross** (trader fazla ödemesin).

---

## Senaryo matrisi (hesaplanmış)

| Senaryo | Bonding | AMM phase | Sorun? |
|---------|---------|-----------|--------|
| Normal buy/sell | Virtual CPMM | Real CPMM | OK |
| Son 793.1M buy (flip tx) | Cap + **fair gross** (fix) | `complete=1` set | Fix gerekli (bugün overpay) |
| Flip spot | virtual ≈ real | ratio ~1.000068 | OK (sub-ppm) |
| Post-flip whale buy | N/A | Fiyat ↑, token alınır | OK (duvar yok) |
| Post-flip dump | N/A | İnce likidite, fiyat ↓ | Ürün riski, bug değil |
| Sell token back | bonding: real_token↑ | AMM: vault↑ — **bonding’e dönme** | One-way kural |
| Fee creator/referrer | accrue_fees | aynı helper | OK |
| emergency_sweep | vault boşalır | tüm coin durur | Mevcut davranış |
| UI complete=1 | bugün **paused** | **trade açık** olmalı | Blocker — fix |
| Chart/indexer spot | virtual | real_sol/vault | Branch gerekli |

---

## Faz 1 — On-chain math (`programs/pump-launchpad/src/math.rs`)

1. `BuyQuote.gross_lamports` — cap vurunca trader’dan sadece fair gross al
2. `quote_amm_buy` / `quote_amm_sell` — real reserves
3. `spot_price_amm_lamports_per_token`
4. Unit tests: cap-buy, flip continuity, amm monotonic price

---

## Faz 2 — On-chain routing (`lib.rs`)

1. `complete=0`: mevcut bonding path (cap fix ile)
2. Son bonding buy: `real_token==0` → `complete=1`
3. `complete=1`: read vault ATA balance = `base`; `quote=real_sol`
4. AMM path: virtual_* dondur (güncelleme yok)
5. `accrue_fees(..., creator)` refactor — bonding + AMM paylaşır
6. TradeEvent spot: phase-aware
7. Buy: `complete!=0` **reject kaldır**; sell aynı

---

## Faz 3 — SDK + defaults

- [`packages/solana-sdk`](packages/solana-sdk/src/index.ts): `virtualSolLamports = 5_000_000_000n`
- [`programs/PUMP_FEEL.md`](programs/PUMP_FEEL.md) güncelle
- Client: `quoteAmmBuyFromCurveState` / `quoteAmmSellFromCurveState` in [`bonding-curve.ts`](apps/web/src/lib/bonding-curve.ts)
- `isAmmPhase(curve)` helper

---

## Faz 4 — Web UI/UX

### TradePanel / TokenDetailLive

| State | UI |
|-------|-----|
| Bonding | Progress bar: sold/793.1M + SOL in curve |
| `complete=1` | Chip: **Graduated** (`section-label`, `text-pump-accent`) |
| Trade | Buy/Sell **açık** — `paused` sadece `paused` flag + emergency_halt |
| Quotes | `complete` → AMM math |

### [`useSolanaTradeMarket.ts`](apps/web/src/hooks/useSolanaTradeMarket.ts)

```ts
// BUGFIX: complete=1 is NOT paused
paused = paused || curve.paused || emergencyHalt
graduated = curve.complete === 1
```

### [`silent-trade.ts`](apps/web/src/lib/solana/silent-trade.ts)

- `complete` throw kaldır
- Phase-aware quote validation

### Mobile

- Dock unchanged (Buy | Sell)
- Graduated chip token header’da (lg+ aside trade panel üstü)

Touch targets ≥44px; mevcut `primary-button` / `panel-surface`.

---

## Faz 5 — Indexer + docs

- [`apps/indexer-sol`](apps/indexer-sol): TradeEvent spot — complete coin’lerde `real_sol/vault`
- [`docs/solana-pumpfun-parity.md`](docs/solana-pumpfun-parity.md): no-graduation → mode-switch
- [`docs/solana-port.md`](docs/solana-port.md)

---

## Smoke test (devnet)

1. `initialize` (5 SOL virtual) → create meme
2. Buy until `complete=1` (~14+ SOL gross)
3. Verify flip spot continuity (chart)
4. AMM buy — more tokens at higher price
5. AMM sell — SOL out, fees accrue
6. Claim creator/referrer fees
7. UI shows Graduated + trade works

---

## Deploy

Program upgrade → `npm run solana:initialize` (Global yeni virtual) → **yeni coinler** test et (eski curve layout uyumlu kalır)

---

## Bilinçli dışarıda

- migrate IX, Pool PDA, LP mint
- PumpSwap / WSOL
- Uniswap 997/1000 LP fee (bizde protocol fee ayrı)
