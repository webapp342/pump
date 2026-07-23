#!/usr/bin/env bash
# Shared deploy bootstrap: git sync + preflight + deps + migrations.
# Sourced by tma-deploy.sh / ui-deploy.sh — do not execute directly.
set -euo pipefail

deploy_sync_repo() {
  local git_ref="${GIT_REF:-main}"
  log "Syncing repo to origin/${git_ref}"
  git fetch origin "$git_ref"
  git reset --hard "origin/${git_ref}"
  export DEPLOY_SHA="$(git rev-parse --short HEAD)"
  export DEPLOY_REF="$git_ref"
  chmod +x deploy/vm/deploy-git-clean.sh deploy/vm/ensure-node-deps.sh \
    deploy/vm/deploy-preflight.sh deploy/vm/run-pending-migrations.sh \
    deploy/vm/deploy-post-smoke.sh 2>/dev/null || true
  bash deploy/vm/deploy-git-clean.sh
}

deploy_ensure_env() {
  ENV_FILE="$REPO_ROOT/.env"
  if [[ -f "$REPO_ROOT/deploy/vm/ensure-solana-env.sh" ]]; then
    chmod +x "$REPO_ROOT/deploy/vm/ensure-solana-env.sh"
    # shellcheck source=/dev/null
    source "$REPO_ROOT/deploy/vm/ensure-solana-env.sh" "$ENV_FILE"
  fi
}

deploy_prepare() {
  local mode="${1:-full}"
  deploy_sync_repo
  deploy_ensure_env
  log() { echo "[tma-deploy] $*"; }
  bash deploy/vm/deploy-preflight.sh "$REPO_ROOT" "$mode"
  log "Checking node dependencies (install only if missing)"
  bash deploy/vm/ensure-node-deps.sh "$REPO_ROOT"
  if [[ "$mode" == "full" ]]; then
    log "Running pending database migrations (ledger: schema_migrations)"
    bash deploy/vm/run-pending-migrations.sh "$REPO_ROOT"
  fi
  if [[ -f "$ENV_FILE" ]]; then
    log "Linking root .env for Next.js build"
    ln -sfn "$ENV_FILE" "$REPO_ROOT/apps/web/.env"
  fi
}
