# Repository structure

Pump launchpad monorepo — single git repo, npm workspaces, corporate `apps/` layout.

```text
pump-tma/
├── apps/
│   ├── web/          @pump/web     Next.js 16 (consumer UI + API routes)
│   ├── admin/        @pump/admin    Vite admin console (injected wallet)
│   ├── indexer/      @pump/indexer  BSC chain indexer (systemd on VM)
│   └── realtime/     @pump/realtime WebSocket fan-out (PM2)
├── packages/         Future shared libs (@pump/shared, etc.)
├── contracts/        Foundry / UUPS proxies
├── db/               SQL migrations + refresh scripts
├── deploy/           VM deploy scripts + nginx snippets
├── scripts/          Dev/ops Node scripts
├── docs/
├── .env.example      Root env template (web + PM2 pump-tma)
├── ecosystem.config.cjs
└── package.json      Workspace root
```

## Commands (from repo root)

| Task | Command |
|------|---------|
| Web dev | `npm run dev` |
| Admin dev | `npm run dev:admin` |
| Web build | `npm run build` |
| Admin build | `npm run build:admin` |
| Typecheck | `npm run typecheck` |

## 21st.dev CLI (component search / publish)

Global install (once per machine):

```bash
npm i -g @21st-dev/cli
21st login
```

Common commands (from repo root):

```bash
21st search "pricing table"
21st add shadcn/button          # review + map to pump-* tokens before shipping
21st publish ./MyComponent.tsx --description "…"
21st edit my-slug --type component --visibility public
21st delete my-slug --type component --yes
```

**Cursor MCP:** `.cursor/mcp.json` points at `https://21st.dev/api/mcp` with `API_KEY_21ST` from [21st.dev/mcp](https://21st.dev/mcp). Add the key to root `.env`, restart Cursor.

**CI:** skip `21st login`; set `API_KEY_21ST` (or `TWENTYFIRST_TOKEN`) or pass `--api-key`.

**Pump note:** prefer `pump-tma-design-system` + `globals.css` classes over raw shadcn installs — adapt 21st output to existing tokens.

## Env files

| Path | Service |
|------|---------|
| `.env` (repo root) | Next.js via PM2 `pump-tma` |
| `apps/realtime/.env` | PM2 `pump-realtime` |
| `/var/www/pump/Indexer/.env` | systemd indexer (rsync’d from `apps/indexer`) |

## Deploy (CI)

Single workflow: `.github/workflows/deploy.yml`

- **UI-only** change → `deploy/ui-deploy.sh` (web + admin, no indexer/realtime)
- **Non-UI** change → `deploy/tma-deploy.sh` (full stack)

Manual:

```bash
gh workflow run deploy.yml -f mode=ui
gh workflow run deploy.yml -f mode=full
```

## VM one-time migration (after pulling monorepo)

Run on VM as deploy user. **Do this once** before or right after the first successful deploy.

```bash
cd /var/www/pump/tma
git pull origin main

# 1. Realtime .env (old path → apps/realtime)
if [ -f realtime/.env ] && [ ! -f apps/realtime/.env ]; then
  mv realtime/.env apps/realtime/.env
fi

# 2. Nginx admin static path
sudo sed -i 's|admin-console/dist|apps/admin/dist|g' /etc/nginx/sites-available/pump
sudo nginx -t && sudo systemctl reload nginx

# 3. Full deploy (build + PM2 reload + indexer) — do NOT pm2 delete before this
chmod +x deploy/tma-deploy.sh
./deploy/tma-deploy.sh

# 4. Persist PM2 after successful deploy
pm2 save
```

If `pump-realtime` was registered before the monorepo move, `pm2 restart` keeps the old `realtime/` path. Either re-run `./deploy/tma-deploy.sh` after `git pull`, or once manually:

```bash
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
bash deploy/vm/indexer-deploy.sh   # if deploy exited before indexer step
```

Verify:

```bash
curl -sf http://127.0.0.1:3012/api/health
curl -sf http://127.0.0.1:3013
bash deploy/vm/system-health.sh | head -20
ls apps/admin/dist/index.html apps/web/.next/standalone/apps/web/server.js
```
