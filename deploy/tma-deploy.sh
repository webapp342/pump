#!/bin/bash
# Full stack deploy — explicit slices (never bare "full" keyword).
set -euo pipefail
export DEPLOY_TARGETS="${DEPLOY_TARGETS:-sync,deps,migrate,packages,web,admin,realtime,ch_flusher,indexer_go,pm2}"
export DEPLOY_PROFILE="${DEPLOY_PROFILE:-full}"
export DEPLOY_MODE="${DEPLOY_MODE:-full}"
exec bash "$(dirname "$0")/vm/deploy-targeted.sh"
