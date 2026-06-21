/**
 * PM2 — pump-tma + pump-realtime (Tier 3: 2× cluster workers each)
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "pump-tma",
      cwd: "/var/www/pump/tma/apps/web/.next/standalone/apps/web",
      script: "server.js",
      exec_mode: "cluster",
      instances: 2,
      env: {
        NODE_ENV: "production",
        PORT: "3012",
        HOSTNAME: "0.0.0.0",
      },
      env_file: "/var/www/pump/tma/.env",
      autorestart: true,
      max_memory_restart: "512M",
    },
    {
      name: "pump-realtime",
      cwd: "/var/www/pump/tma/apps/realtime",
      script: "dist/server.js",
      exec_mode: "cluster",
      instances: 2,
      env: {
        NODE_ENV: "production",
        PORT: "3013",
        REDIS_URL: "redis://127.0.0.1:6379",
      },
      env_file: "/var/www/pump/tma/apps/realtime/.env",
      autorestart: true,
      max_memory_restart: "256M",
    },
  ],
};
