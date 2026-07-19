# Solana production cutover — one-time VM steps after first push

Push to `main` runs `deploy/tma-deploy.sh`, which:

1. Patches `/var/www/pump/tma/.env` → `NEXT_PUBLIC_CHAIN_FAMILY=solana` + program IDs + RPC
2. Applies migration `044_solana_wallets.sql`
3. Builds Next.js with Solana env inlined
4. Deploys `indexer-sol` (if systemd unit exists)

## One-time on VM (SSH)

```bash
cd /var/www/pump/tma

# 1) Helius RPC in .env (replace YOUR_KEY)
nano .env
# NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
# SOLANA_RPC_URL=same

# 2) Solana indexer systemd (once)
sudo cp deploy/pump-indexer-sol.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pump-indexer-sol

# Indexer env lives at apps/indexer-sol/.env (not /var/www/pump/indexer-sol)
nano apps/indexer-sol/.env

# 3) Optional: stop EVM indexer (no longer used)
sudo systemctl stop pump-indexer pump-airdrop-keeper || true
sudo systemctl disable pump-indexer pump-airdrop-keeper || true

# 4) Optional: stop Alto bundler (Kernel not used on Solana)
pm2 stop alto 2>/dev/null || true

# 5) Re-run deploy or wait for next push
./deploy/tma-deploy.sh
```

## Verify

```bash
grep CHAIN_FAMILY /var/www/pump/tma/.env
journalctl -u pump-indexer-sol -n 20 --no-pager
curl -sf http://127.0.0.1:3012/api/health
```

## Rollback to EVM (emergency)

In `/var/www/pump/tma/.env`:

```env
NEXT_PUBLIC_CHAIN_FAMILY=evm
SKIP_EVM_INDEXER=0
```

Then `./deploy/tma-deploy.sh` and restart `pump-indexer`.
