# Ingest Cutover Runbook — TS → Go Indexer

**F5 cutover · F6 TS retire**

## Pre-cutover checklist

- [ ] F1 Redis weekly XP smoke (trade → ZSCORE)
- [ ] F2 ch-flusher lag p95 < 5s
- [ ] Go decode parity: 1000 tx sample vs TS (fields match)
- [ ] Shadow mode 72h: Go writes Redis only, TS primary PG

## Phase 5a — Read-only Go

```bash
cd /var/www/pump/tma/apps/indexer-sol-go
GO_SHADOW_MODE=read_only go run ./cmd/indexer
# Verify: logs show decoded events, no PG writes
```

## Phase 5b — Shadow Redis

```bash
GO_SHADOW_MODE=redis_only systemd start pump-indexer-sol-go
# Compare ZINCRBY / PUBLISH counts TS vs Go for 72h
```

## Phase 5c — Go primary

```bash
systemctl stop pump-indexer-sol
systemctl start pump-indexer-sol-go
# Env: SOLANA_INDEXER_SOURCE=geyser
#      INDEXER_IMPL=go
```

## Phase 5d — TS retire (F6)

```bash
systemctl disable pump-indexer-sol
# Keep binary 14d for rollback
```

## Rollback (< 5 min)

```bash
systemctl stop pump-indexer-sol-go
systemctl start pump-indexer-sol
# .env: SOLANA_INDEXER_SOURCE=rpc
#       INDEXER_IMPL=ts
```

## LaserStream env

```bash
SOLANA_GEYSER_ENDPOINT=https://laserstream-devnet-ewr.helius-rpc.com
HELIUS_API_KEY=...
SOLANA_GEYSER_PROGRAM_IDS=Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus
```

## Health signals

| Signal | OK | Alert |
|--------|-----|-------|
| WS board latency p95 | ≤ TS baseline | +50% |
| Redis stream lag `pump:ch:*` | < 5000 | > 20000 |
| PG trades insert rate | matches trade rate | gap > 1 min |
| Slot cursor | advancing | stuck 5+ min |

## Post-cutover

- [ ] Update `deploy/vm/system-health.sh` for Go service name
- [ ] Log cutover in [`guncelleme-ilerleme.md`](./guncelleme-ilerleme.md#f5)
