# Pump Admin Console — standalone MetaMask ops UI

Published at **`/admin/`** on the same host as TMA (nginx static). API calls go to same-origin `/api/*`.

## Local dev

Terminal 1 — TMA:

```bash
npm run dev          # :3012
# or dev:local :80 → set VITE_PUMP_API_URL=http://127.0.0.1:80 in .env
```

Terminal 2:

```bash
npm run dev:admin    # http://localhost:5174  (base /, proxies /api → TMA)
```

## Production (VM)

CI `tma-deploy.sh` runs `deploy/admin-console-build.sh` automatically.

URL: **http://104.207.64.115/admin/**

### One-time nginx (if `/admin/` 404 after deploy)

```bash
ssh -p 22022 root@104.207.64.115
cp /var/www/pump/tma/deploy/nginx-pump.conf /etc/nginx/sites-available/pump
# or merge the /admin/ location block into your active site file
nginx -t && systemctl reload nginx
curl -sI http://127.0.0.1/admin/ | head -5
```

### Manual rebuild on VM

```bash
cd /var/www/pump/tma
bash deploy/admin-console-build.sh
```

No PM2 — nginx serves `admin-console/dist/`.

## Data wipe (Environment)

Admin **Reset data** calls `wipe_launchpad_app_data()` (migration `052`).

| Kept | Wiped |
|------|--------|
| `launchpad_tasks` (promoted campaigns + system missions) | `users` (XP / points) |
| `contract_registry` | `points_inventory` / `points_redemptions` (claimed perks) |
| `platform_settings` | `launchpad_user_*_completions` (finished challenges) |
| `admin_todos` | `referral_invite_xp_claims`, airdrop + rewards leaderboard tables |
| | tokens / trades / positions / wallets / `indexer_state` |

Apply on VM if wipe is outdated:

```bash
sudo -u postgres psql -d pump_db -f db/migrations/052_wipe_launchpad_app_data_comprehensive.sql
```

## Auth

- UI: MetaMask + `NEXT_PUBLIC_ADMIN_ADDRESS`
- API: `/api/admin/*?address=0x...`

## Ports (do not mix)

| Service | Port |
|---------|------|
| nginx (public) | 80 |
| TMA | 3012 |
| realtime WS | 3013 |
| Alto bundler | 4337 |
| admin dev only | 5174 |
