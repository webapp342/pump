#!/usr/bin/env bash
# Prefer PM2 native Skandha (lighter). Use setup-skandha-docker.sh only if you want Docker.
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-skandha-pm2.sh" "$@"
