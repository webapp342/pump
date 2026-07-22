/**
 * PM2 — pump-tma + pump-realtime (Tier 3: 2× cluster workers each)
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * PM2 does not load `env_file` natively — parse .env here and inject via `env`.
 * After editing .env on disk:
 *   pm2 startOrRestart ecosystem.config.cjs --update-env
 */
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = process.env.PUMP_REPO_ROOT ?? "/var/www/pump/tma";
const TMA_ENV_PATH = path.join(REPO_ROOT, ".env");
const REALTIME_ENV_PATH = path.join(REPO_ROOT, "apps", "realtime", ".env");

/** @param {string} filePath */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[ecosystem] env file missing: ${filePath}`);
    return {};
  }

  /** @type {Record<string, string>} */
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const tmaEnv = parseEnvFile(TMA_ENV_PATH);
const realtimeEnv = parseEnvFile(REALTIME_ENV_PATH);

module.exports = {
  apps: [
    {
      name: "pump-tma",
      cwd: path.join(REPO_ROOT, "apps/web/.next/standalone/apps/web"),
      script: "server.js",
      exec_mode: "cluster",
      instances: 2,
      env: {
        NODE_ENV: "production",
        PORT: "3012",
        HOSTNAME: "0.0.0.0",
        PUMP_REPO_ROOT: REPO_ROOT,
        ...tmaEnv,
      },
      autorestart: true,
      max_memory_restart: "512M",
    },
    {
      name: "pump-realtime",
      cwd: path.join(REPO_ROOT, "apps/realtime"),
      script: "dist/server.js",
      exec_mode: "cluster",
      instances: 2,
      env: {
        NODE_ENV: "production",
        PORT: "3013",
        REDIS_URL: "redis://127.0.0.1:6379",
        ...realtimeEnv,
      },
      autorestart: true,
      max_memory_restart: "256M",
    },
    {
      name: "pump-ch-flusher",
      cwd: REPO_ROOT,
      script: path.join(REPO_ROOT, "apps/ch-flusher/dist/flusher.js"),
      instances: 1,
      env: {
        NODE_ENV: "production",
        PUMP_REPO_ROOT: REPO_ROOT,
        REDIS_URL: tmaEnv.REDIS_URL ?? "redis://127.0.0.1:6379",
        CLICKHOUSE_URL: tmaEnv.CLICKHOUSE_URL ?? "http://127.0.0.1:8123",
        CLICKHOUSE_DATABASE: tmaEnv.CLICKHOUSE_DATABASE ?? "pump",
        ...tmaEnv,
      },
      autorestart: true,
      max_memory_restart: "128M",
    },
    {
      name: "pump-price-worker",
      cwd: REPO_ROOT,
      script: path.join(REPO_ROOT, "node_modules/.bin/tsx"),
      args: "scripts/price-worker.ts",
      interpreter: "none",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PUMP_REPO_ROOT: REPO_ROOT,
        REDIS_URL: tmaEnv.REDIS_URL ?? "redis://127.0.0.1:6379",
        ...tmaEnv,
      },
      autorestart: true,
      max_memory_restart: "128M",
    },
  ],
};
