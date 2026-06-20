# Alto bundler — Pump VM deploy

Self-hosted ERC-4337 bundler (same engine as Pimlico cloud, **no SaaS API key**).

Full architecture: [`.cursor/docs/self-hosted-bundler-2026.md`](../../.cursor/docs/self-hosted-bundler-2026.md)

## VM one-shot (after `git pull`)

```bash
cd /var/www/pump/tma

export BUNDLER_RELAYER_PRIVATE_KEY=0x...          # or BUNDLER_EXECUTOR_PRIVATE_KEYS
export BUNDLER_CHAIN_RPC_URL=https://bnb-testnet.g.alchemy.com/v2/PAYG_KEY

bash deploy/bundler/alto/migrate-from-skandha.sh
```

## TMA `.env` (VM)

```bash
BUNDLER_RPC_URL=http://127.0.0.1:4337/rpc
# Remove PIMLICO_API_KEY
pm2 restart pump-tma
```

## Local dev (SSH tunnel)

```powershell
ssh -p 22022 -L 16432:127.0.0.1:6432 -L 4337:127.0.0.1:4337 root@104.207.64.115
```

`.env`:

```bash
BUNDLER_RPC_URL=http://127.0.0.1:4337/rpc
```

Then `npm run dev` — client uses `/api/bundler/rpc` → Alto.

## Health

```bash
bash deploy/bundler/alto/health.sh
curl -s http://127.0.0.1:4337/health
```

## Executor BNB

Fund executor + utility addresses with BSC testnet BNB (faucet). Alto auto-refills executors from utility wallet.

**Config note:** `min-executor-balance` in `alto-config.json` must be **wei** (e.g. `"10000000000000000"` = 0.01 BNB), not a decimal like `"0.01"`.

## Alchemy tier

| Tier | env |
|------|-----|
| PAYG (recommended) | default `max-block-range=128` |
| Free | `ALCHEMY_FREE_TIER=1` → range 9 |

## Ports

| Service | Port |
|---------|------|
| Alto | 4337 |
| Skandha (deprecated) | 14337 |
