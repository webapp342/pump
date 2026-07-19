# Solana deploy — Pinocchio launchpad (primary)

Lowest-rent path: **one** Pinocchio program (`pump-launchpad`).

| | |
|--|--|
| Program ID | `Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus` |
| Binary | ~29 KB → **~0.20 SOL** rent |
| Crate | `programs/pump-launchpad/` |

## Build / deploy (WSL)

```bash
bash scripts/solana/wsl-pinocchio-build.sh
# optional RPC:
export SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=..."
bash scripts/solana/wsl-pinocchio-deploy.sh
npm run solana:initialize
```

Or from repo root: `npm run solana:build` / `solana:deploy` / `solana:initialize`.

## Instructions (1-byte tag)

| Tag | Name |
|-----|------|
| 0 | initialize |
| 1 | create_meme |
| 2 | buy |
| 3 | sell |
| 4 | withdraw_treasury |

Defaults: `@pump/solana-sdk` `PUMP_FEEL_DEFAULTS` + `encodeInitializeIx`.

## Legacy Anchor

`programs/pump-curve` (and old factory/treasury) are **deprecated** for deploy. Keep for reference only.

Remaining product stack: `docs/solana-stack-plan.md`.
