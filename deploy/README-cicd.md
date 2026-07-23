# Pump CI/CD — targeted deploy (2026)

## Akış

```
push main → CI validate → classify (path filter) → SSH deploy-targeted.sh
```

GitHub Actions **Deploy summary** tabında: `profile` + `targets` görünür.

## Otomatik profiller

| Push değişikliği | Profile | VM'de ne olur |
|------------------|---------|----------------|
| `apps/indexer-sol-go/**` only | `indexer_only` | git sync + `go build` + `systemctl restart pump-indexer-sol-go` (~1 dk) |
| `db/migrations/**` only | `migrate_only` | git sync + `run-pending-migrations.sh` (ledger) |
| `apps/web` pages/components | `ui_or_web` | deps + Next build + `pm2 pump-tma` |
| `apps/web/src/app/api`, `lib` | `targeted` | + packages build + migrate yok (db yoksa) |
| `apps/realtime/**` | `targeted` | realtime build + `pm2 pump-realtime` (Redis WS) |
| `apps/ch-flusher/**` | `targeted` | ch-flusher build + `pm2 pump-ch-flusher` only |
| `apps/admin/**` only | `admin_only` | Vite admin build only — **no Next.js, no pm2** |
| `deploy/**` only | `sync_only` | git sync — **no npm ci, no rebuild** (~10s) |
| `scripts/price-worker.ts` | `targeted` | `pm2 pump-price-worker` only |
| Karışık (web+realtime vb.) | `targeted` | sadece değişen slice'lar + ilgili pm2 |
| Manuel `mode=full` | `full` | tüm slice'lar (ilk kurulum / acil) |

## Migration (otomatik)

- Her deploy'da **pending** migration'lar `schema_migrations` ledger ile uygulanır.
- Mevcut prod DB: bir kez bootstrap (tekrar 001–054 çalışmaz).
- Yeni `db/migrations/055_*.sql` → push → otomatik apply.

## Manuel deploy

```bash
gh workflow run deploy.yml -f mode=indexer   # sadece Go indexer
gh workflow run deploy.yml -f mode=ui        # sadece UI
gh workflow run deploy.yml -f mode=migrate   # sadece DB migration
gh workflow run deploy.yml -f mode=realtime  # WS sunucu
gh workflow run deploy.yml -f mode=full      # her şey
```

## VM'de doğrudan

```bash
cd /var/www/pump/tma
DEPLOY_TARGETS=sync,indexer_go bash deploy/vm/deploy-targeted.sh
DEPLOY_TARGETS=sync,migrate bash deploy/vm/deploy-targeted.sh
DEPLOY_MODE=full bash deploy/vm/deploy-targeted.sh
```

## Env / servis (otomatik)

| Bileşen | Deploy slice | Restart |
|---------|--------------|---------|
| Postgres SSOT | `migrate` | SQL apply |
| Redis pub/sub | `realtime` | pm2 pump-realtime |
| ClickHouse stream | `ch_flusher` | pm2 pump-ch-flusher |
| WS board | `web` + realtime | pm2 |
| Go indexer | `indexer_go` | systemctl pump-indexer-sol-go |
| Next.js | `web` | pm2 pump-tma only |
| Admin (nginx /admin/) | `admin` | **no pm2** |
| Price worker | `price_worker` | pm2 pump-price-worker only |

Log prefix VM'de `[deploy:ui_or_web]` / `[deploy:indexer_only]` — eski `[tma-deploy]` monolitik script artık kullanılmıyor.

`ecosystem.config.cjs` değişince → `pm2` slice (tüm PM2 apps).

## Indexer Go notu

VM'de Go 1.25.1+ yoksa indexer slice **warn + skip** (web deploy devam). Zorunlu: `INDEXER_DEPLOY_REQUIRED=1`.

## Cache

- GitHub: `node_modules` cache (lock aynı → npm ci skip)
- VM: `.deploy/` stamp + `node_modules` + `.next` korunur

## Reconcile (her deploy sonu)

`deploy-reconcile-services.sh` — rebuild yok; sadece heal:

| Servis | Ne zaman müdahale |
|--------|-------------------|
| pm2 pump-tma / realtime / ch-flusher / price-worker | status ≠ online |
| web / realtime HTTP | health fail → pm2 restart |
| pump-indexer-sol-go | inactive / failed / binary yok → `indexer-sol-go-deploy.sh` |

`sync_only` deploy bile indexer'ı ayağa kaldırır (önceki full deploy'da Go skip edilmişse).
