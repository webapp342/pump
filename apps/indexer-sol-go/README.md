# pump-indexer-sol-go (F5)

Solana launchpad indexer — **Helius LaserStream gRPC only** (no RPC poll / WS).

## Ingest (quota-optimized)

Single `transactions` filter:

- `accountInclude`: launchpad program ID(s) — deduped
- `vote: false`, `failed: false`
- `commitment: CONFIRMED`
- No slots / blocks / accounts subscriptions
- SDK auto-reconnect + slot replay (default)

Ref: [Helius LaserStream clients](https://www.helius.dev/docs/laserstream/clients)

## Env

Copy `.env.example` → `.env`:

```bash
SOLANA_GEYSER_ENDPOINT=https://laserstream-devnet-ewr.helius-rpc.com
HELIUS_API_KEY=<dashboard key>
SOLANA_GEYSER_PROGRAM_IDS=Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus
GO_SHADOW_MODE=read_only   # decode + metrics until F5c PG/Redis writes
```

Also accepts `SOLANA_GEYSER_API_KEY` / `SOLANA_GEYSER_TOKEN`.

## Build (Go 1.25.1+)

```bash
go test ./...
go build -o bin/indexer-sol-go ./cmd/indexer
```

VM:

```bash
bash deploy/vm/build-indexer-sol-go.sh
sudo systemctl restart pump-indexer-sol-go
```

**Tek ingest:** disable TS indexer when Go is primary:

```bash
sudo systemctl stop pump-indexer-sol
sudo systemctl disable pump-indexer-sol
```

## Cutover

See [`docs/ingest-cutover-runbook.md`](../../docs/ingest-cutover-runbook.md).
