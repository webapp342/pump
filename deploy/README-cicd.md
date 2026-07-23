# Pump deploy pipeline (VM SSH)
#
# Flow: CI validate → path classify → tma-deploy | ui-deploy
# Scripts: deploy/tma-deploy.sh, deploy/vm/run-pending-migrations.sh
#
# Env flags (VM):
#   SKIP_INDEXER_DEPLOY=1     — skip Go indexer
#   INDEXER_DEPLOY_REQUIRED=1 — fail deploy if indexer fails (default: warn only)
#   USE_TS_INDEXER=1          — rollback to TS indexer-sol
#
# Caches preserved between deploys: node_modules, apps/web/.next, Go bin (.deploy/)
