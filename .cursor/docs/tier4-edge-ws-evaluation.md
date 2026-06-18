# Tier 4 — Edge WebSocket değerlendirmesi

**Durum:** Bilinçli erteleme (tek VM deploy).

## Hedef

Coğrafi olarak kullanıcıya en yakın WS terminator → arena/token room latency < 50ms P95 global.

## Seçenekler

| Seçenek | Uygunluk | Not |
|---------|----------|-----|
| Cloudflare Durable Objects + WS | Orta | Redis Pub/Sub bridge gerekir; state room başına |
| Fly.io / regional Node | Orta | `pump-realtime` replika + sticky sessions |
| Mevcut tek VM + PM2 cluster | ✅ bugün | Tier 3 yeterli < 2000 WS |

## Geçiş koşulu

- Eşzamanlı WS > 2000 sürekli
- Arena WS P95 > 100ms (Türkiye / EU dışı kullanıcı payı > %30)

## Mimari sketch (gelecek)

```
Indexer → Redis (global)
       → Regional realtime (EU + US) → browser
Next.js SSR → primary VM (veya edge cache)
```

Pump bugün **Redis Streams replay + seq** ile reconnect gap'i kapatıyor; edge scale öncesi ölçüm: `arena_ws_patch_latency_ms`.
