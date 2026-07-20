# Fiyat Semantiği Sözleşmesi — 99.9% Doğruluk

Pump’ta **tek bir “fiyat” yok**. Binance/Tradovate standardında üç ayrı kavram kullanılır. Karıştırmak kullanıcı güvenini kırar ($0.10 gösterip $0.11 fill).

## Tipler

### 1. Spot (Mark)

- **Tanım:** Bonding curve marginal fiyat — bir sonraki infinitesimal tokenın BNB fiyatı.
- **Hesap:** `spotPriceBnbFromBondingDecimals(reserve, tokenSold)` veya trade replay (`buildTradeSpotTicks`).
- **Kullan:**
  - Arena MCAP / %
  - Token sayfası header fiyat
  - Chart mumları (open/high/low/close)
  - Holders tab **Value / P/L** (exit quote — sell-all simulation, not spot×balance)
  - Portfolio mark değeri (exit quote when curve known)

### 2. Quote (Tahmin)

- **Tanım:** Kullanıcı “Buy/Sell”e basmadan önce curve simülasyonu; mevcut state üzerinden.
- **Hesap:** `quoteBuyFromCurveState` / `quoteSellFromCurveState` + `minOutWithSlippage`.
- **Kullan:**
  - Trade panel “You receive ≈ …”
  - “Min received” satırı
- **UI kuralı:** Her zaman **“Est.”** veya “~” prefix. Asla “Price: $X” without qualifier.

### 3. Fill (Execution)

- **Tanım:** Zincirde gerçekleşen işlem — net BNB ÷ token miktarı (fee sonrası).
- **Hesap:** `tradeFillPriceBnb(nativeAmount, tokenAmount, fee, net)`.
- **Kullan:**
  - Trade tape “Price” kolonu
  - On-chain doğrulama
- **UI kuralı:** Tape’de spot gösterme.

## Beklenen fark (normal)

Küçük alımlarda fill ≠ spot olabilir (curve hareketi + fee). Bu hata değil — **slippage**.

Kullanıcıya gösterim:

```text
Est. price: ~$0.100          ← quote (spot at submit)
Min received: 1,234 TOKEN    ← slippage protected
---
Tape after confirm: $0.103   ← fill (can differ within slippage bps)
```

## 99.9% SLA

```text
|fill_usd - quote_usd| / quote_usd ≤ (SLIPPAGE_BPS + 50) / 10000
```

İhlal → indexer/UI bug; log `price_accuracy_violation`.

## Dosya haritası

| Dosya | Rol |
|-------|-----|
| `src/lib/bonding-curve.ts` | Curve math, quotes |
| `src/lib/mark-price.ts` | Spot resolution chain |
| `src/lib/candles.ts` | Chart spot replay |
| `src/lib/format-usd.ts` | Fill formatting |
| `src/components/token/TradePanel.tsx` | Quote UI |
| `src/components/token/TradeTape.tsx` | Fill UI |

## WS / DB

- WS `bonding.marketCapZug` **kullanma** — `spot × 1B supply` hesapla (`arena-live-delta.ts`).
- DB `last_price_zug` = spot (indexer); execution `price_zug` sadece `trades` tablosunda.

## Chart USD

- Mumlar **native** (token/ETH veya token/BNB) saklanır; USD sadece formatter (`ohlc × nativeUsd`).
- ETH/USD oracle değişince işlem olmasa bile USD chart yukarı/aşağı kayar — doğru davranış.
- Kontrata idle poll **yapma**; native spot trade dışında değişmez.
- Gap mumları: SQL `gap_fill_candles` + client `extendSeriesToLiveBucket` only.
- **OHLC kuralı (trade-only):** high/low yalnızca gerçekleşen trade spot’larından; live pin sadece close günceller (transient mark wick üretmez).
- **Solana virtuals:** board reconcile / mark price `bonding_states.virtual_*` kullanır — EVM default 5/1B Solana satırlarını ezmez.
