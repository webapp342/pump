#!/usr/bin/env bash
# Preserve deploy caches between CI/CD runs (cold Next.js rebuild was ~5–8 min every push).
set -euo pipefail

git clean -fd \
  -e node_modules \
  -e 'apps/*/node_modules' \
  -e 'packages/*/node_modules' \
  -e apps/web/.next \
  -e apps/indexer-sol-go/bin \
  -e apps/admin/dist \
  -e .deploy
