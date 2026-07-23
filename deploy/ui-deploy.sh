#!/bin/bash
# UI-only deploy — pages/components/admin (no API/realtime/indexer).
set -euo pipefail
export DEPLOY_TARGETS="${DEPLOY_TARGETS:-sync,deps,web,admin}"
export DEPLOY_PROFILE="${DEPLOY_PROFILE:-ui_or_web}"
exec bash "$(dirname "$0")/vm/deploy-targeted.sh"
