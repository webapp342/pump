#!/usr/bin/env bash
# Classify push diff → DEPLOY_TARGETS for targeted VM deploy.
# Never emits bare "full" for auto pushes — use explicit slices only.
set -euo pipefail

truthy() { [[ "${1:-}" == "true" || "${1:-}" == "1" ]]; }

INDEXER_GO="${F_INDEXER_GO:-false}"
WEB_UI="${F_WEB_UI:-false}"
WEB_API="${F_WEB_API:-false}"
WEB_ANY="${F_WEB_ANY:-false}"
REALTIME="${F_REALTIME:-false}"
CH_FLUSHER="${F_CH_FLUSHER:-false}"
PRICE_WORKER="${F_PRICE_WORKER:-false}"
PACKAGES="${F_PACKAGES:-false}"
DB="${F_DB:-false}"
ADMIN="${F_ADMIN:-false}"
ECOSYSTEM="${F_ECOSYSTEM:-false}"
LOCKFILE="${F_LOCKFILE:-false}"
DEPLOY_VM="${F_DEPLOY_VM:-false}"
MANUAL_MODE="${DEPLOY_MODE:-auto}"

declare -A T=()
add() { T[$1]=1; }

# Local fallback (VM dry-run)
if [[ "${GITHUB_ACTIONS:-}" != "true" && -d .git ]]; then
  diff_base="${DIFF_BASE:-HEAD~1}"
  changed="$(git diff --name-only "$diff_base" HEAD 2>/dev/null || true)"
  match() { echo "$changed" | grep -qE "$1"; }
  match '^apps/indexer-sol-go/' && INDEXER_GO=true
  match '^apps/web/src/components/|^apps/web/src/app/.+/page\.tsx|^apps/web/src/app/globals\.css' && WEB_UI=true
  match '^apps/web/src/app/api/|^apps/web/src/lib/|^apps/web/src/hooks/|^apps/web/src/config/' && WEB_API=true
  match '^apps/web/' && WEB_ANY=true
  match '^apps/realtime/' && REALTIME=true
  match '^apps/ch-flusher/' && CH_FLUSHER=true
  match '^scripts/price-worker\.ts$|^deploy/vm/start-price-worker\.sh$' && PRICE_WORKER=true
  match '^packages/' && PACKAGES=true
  match '^db/' && DB=true
  match '^apps/admin/' && ADMIN=true
  match '^ecosystem\.config\.cjs$' && ECOSYSTEM=true
  match '^package\.json$|^package-lock\.json$' && LOCKFILE=true
  match '^deploy/' && DEPLOY_VM=true
fi

add sync

case "$MANUAL_MODE" in
  full)
    add deps
    add migrate
    add packages
    add web
    add admin
    add realtime
    add ch_flusher
    add indexer_go
    add pm2
    ;;
  ui)
    add deps
    add web
    ;;
  indexer)
    add indexer_go
    ;;
  realtime)
    add deps
    add realtime
    ;;
  migrate)
    add migrate
    ;;
  auto|*)
    if truthy "$DB"; then add migrate; fi
    if truthy "$LOCKFILE"; then add deps; fi
    if truthy "$PACKAGES"; then add deps; add packages; add web; fi
    if truthy "$WEB_ANY"; then add deps; add web; fi
    if truthy "$ADMIN"; then add deps; add admin; fi
    if truthy "$REALTIME"; then add deps; add realtime; fi
    if truthy "$CH_FLUSHER"; then add deps; add ch_flusher; fi
    if truthy "$PRICE_WORKER"; then add deps; add price_worker; fi
    if truthy "$INDEXER_GO"; then add indexer_go; fi
    if truthy "$ECOSYSTEM"; then add pm2; fi
    # deploy/** script changes alone → git sync only (no npm ci / rebuild)

    # UI-only profile (pages/components, no API/lib/packages/db/indexer)
    if truthy "$WEB_UI" && ! truthy "$WEB_API" && ! truthy "$PACKAGES" && ! truthy "$DB" \
      && ! truthy "$INDEXER_GO" && ! truthy "$REALTIME" && ! truthy "$CH_FLUSHER" \
      && ! truthy "$PRICE_WORKER"; then
      T=([sync]=1 [deps]=1 [web]=1)
      truthy "$ADMIN" && add admin
    fi

    # Indexer-only
    if truthy "$INDEXER_GO" && ! truthy "$WEB_ANY" && ! truthy "$PACKAGES" \
      && ! truthy "$REALTIME" && ! truthy "$CH_FLUSHER" && ! truthy "$ADMIN" \
      && ! truthy "$PRICE_WORKER"; then
      T=([sync]=1 [indexer_go]=1)
      truthy "$DB" && add migrate
    fi

    # DB-only migration
    if truthy "$DB" && ! truthy "$WEB_ANY" && ! truthy "$INDEXER_GO" \
      && ! truthy "$REALTIME" && ! truthy "$CH_FLUSHER" && ! truthy "$PACKAGES" \
      && ! truthy "$ADMIN" && ! truthy "$PRICE_WORKER"; then
      T=([sync]=1 [migrate]=1)
    fi

    # Realtime-only
    if truthy "$REALTIME" && ! truthy "$WEB_ANY" && ! truthy "$INDEXER_GO" \
      && ! truthy "$CH_FLUSHER" && ! truthy "$PACKAGES" && ! truthy "$DB" \
      && ! truthy "$PRICE_WORKER"; then
      T=([sync]=1 [deps]=1 [realtime]=1)
    fi

    # CH flusher-only
    if truthy "$CH_FLUSHER" && ! truthy "$WEB_ANY" && ! truthy "$INDEXER_GO" \
      && ! truthy "$REALTIME" && ! truthy "$PACKAGES" && ! truthy "$DB" \
      && ! truthy "$PRICE_WORKER"; then
      T=([sync]=1 [deps]=1 [ch_flusher]=1)
    fi

    # Admin-only (nginx static — no Next.js / pm2)
    if truthy "$ADMIN" && ! truthy "$WEB_ANY" && ! truthy "$INDEXER_GO" \
      && ! truthy "$REALTIME" && ! truthy "$CH_FLUSHER" && ! truthy "$PACKAGES" \
      && ! truthy "$DB" && ! truthy "$PRICE_WORKER"; then
      T=([sync]=1 [deps]=1 [admin]=1)
    fi

    # Price worker-only
    if truthy "$PRICE_WORKER" && ! truthy "$WEB_ANY" && ! truthy "$INDEXER_GO" \
      && ! truthy "$REALTIME" && ! truthy "$CH_FLUSHER" && ! truthy "$PACKAGES" \
      && ! truthy "$DB" && ! truthy "$ADMIN"; then
      T=([sync]=1 [deps]=1 [price_worker]=1)
    fi

    # deploy/** or docs-only / unknown → sync only (no fallback full rebuild)
    ;;
esac

ORDER=(sync deps migrate packages web admin realtime ch_flusher price_worker indexer_go pm2)
targets=()
for key in "${ORDER[@]}"; do
  [[ -n "${T[$key]:-}" ]] && targets+=("$key")
done

profile="targeted"
if [[ "$MANUAL_MODE" == "full" ]]; then
  profile="full"
elif [[ " ${targets[*]} " == *" indexer_go "* ]] && [[ " ${targets[*]} " != *" web "* ]]; then
  profile="indexer_only"
elif [[ " ${targets[*]} " == *" migrate "* ]] && [[ ${#targets[@]} -le 2 ]]; then
  profile="migrate_only"
elif [[ " ${targets[*]} " == *" admin "* ]] && [[ " ${targets[*]} " != *" web "* ]]; then
  profile="admin_only"
elif [[ " ${targets[*]} " == *" web "* ]] && [[ " ${targets[*]} " != *" realtime "* ]] \
  && [[ " ${targets[*]} " != *" indexer_go "* ]] && [[ " ${targets[*]} " != *" admin "* ]] \
  && [[ ${#targets[@]} -le 4 ]]; then
  profile="ui_or_web"
elif [[ ${#targets[@]} -le 1 ]]; then
  profile="sync_only"
fi

joined="$(IFS=,; echo "${targets[*]}")"
echo "[classify] profile=$profile targets=$joined"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "deploy_targets=$joined" >> "$GITHUB_OUTPUT"
  echo "deploy_profile=$profile" >> "$GITHUB_OUTPUT"
fi
