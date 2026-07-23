#!/usr/bin/env bash
# Build pump-indexer-sol-go binary on VM (F5a read-only shadow).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/apps/indexer-sol-go"

if ! command -v go >/dev/null 2>&1; then
  echo "install Go 1.22+ first"
  exit 1
fi

go mod tidy
go test ./...
mkdir -p bin
go build -o bin/indexer-sol-go ./cmd/indexer
chmod +x bin/indexer-sol-go

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[indexer-sol-go] created .env from .env.example — set GO_SHADOW_MODE=read_only"
fi

echo "OK bin/indexer-sol-go"
echo "Note: tma-deploy runs git clean — re-run this script after each CI/CD deploy."
echo "Install/restart: sudo cp deploy/vm/pump-indexer-sol-go.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart pump-indexer-sol-go"
echo "Run: GO_SHADOW_MODE=read_only ./bin/indexer-sol-go"
