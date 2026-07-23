# pump-indexer-sol-go (F5)

Go indexer — phased cutover from `apps/indexer-sol` (TS).

## Modes (`GO_SHADOW_MODE`)

| Mode | Behavior |
|------|----------|
| `read_only` | RPC poll → decode → log + metrics (no writes) |
| `redis_only` | F5b — Redis ZINCRBY/PUBLISH/XADD only |
| _(empty / primary)_ | F5c — full PG + Redis + CH stream |

## F5a — run locally

```bash
cd apps/indexer-sol-go
cp .env.example .env
GO_SHADOW_MODE=read_only go run ./cmd/indexer
```

Build:

```bash
go test ./...
go build -o bin/indexer-sol-go ./cmd/indexer
```

VM:

```bash
bash deploy/vm/build-indexer-sol-go.sh
sudo cp deploy/vm/pump-indexer-sol-go.service /etc/systemd/system/
sudo systemctl enable --now pump-indexer-sol-go
```

## Decode parity

Go discriminators match TS `@pump/solana-sdk` event names (`sha256("event:{Name}")[0:8]`).

```bash
go test ./internal/decode/...
```

## Cutover

See [`docs/ingest-cutover-runbook.md`](../../docs/ingest-cutover-runbook.md).
