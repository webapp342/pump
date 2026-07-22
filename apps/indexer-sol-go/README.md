# pump-indexer-sol-go (F5)

Go indexer with Helius LaserStream / Yellowstone gRPC ingest.

## Modes

| Env | Behavior |
|-----|----------|
| `GO_SHADOW_MODE=read_only` | Decode + metrics, no writes |
| `GO_SHADOW_MODE=redis_only` | Redis ZINCRBY/PUBLISH/XADD only |
| (default) | Full PG + Redis + CH stream writes |

## Run

```bash
cp .env.example .env
go run ./cmd/indexer
```

## Cutover

See [`docs/ingest-cutover-runbook.md`](../../docs/ingest-cutover-runbook.md).
