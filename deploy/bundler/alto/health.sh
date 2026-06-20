#!/usr/bin/env bash
# Quick Alto bundler health check (run on VM weekly).
set -euo pipefail

RPC="${BUNDLER_RPC_URL:-http://127.0.0.1:4337/rpc}"

echo "=== Alto bundler health ==="
curl -sf -X POST "$RPC" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  | python3 -m json.tool

curl -sf -X POST "$RPC" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"pimlico_getUserOperationGasPrice","params":[]}' \
  | python3 -m json.tool

pm2 describe pump-alto 2>/dev/null | grep -E 'status|uptime|restarts' || echo "pump-alto not in pm2"
