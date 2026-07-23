import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";
import { withSerwist } from "@serwist/turbopack";
import { loadMonorepoRootEnv } from "./src/lib/load-monorepo-env";

/** Monorepo root — standalone tracing + turbopack resolve shared deps. */
const monorepoRoot = path.join(__dirname, "../..");

/** VM/prod build parallelism (2–4 cores typical). Leave 1 core for OS. */
const buildCpus = Math.max(
  1,
  Number(process.env.NEXT_BUILD_CPUS ?? "") ||
    Math.min(4, Math.max(1, (os.cpus()?.length ?? 2) - 1))
);

/** VM + local: single `.env` at repo root (PM2), not apps/web/.env */
loadMonorepoRootEnv(monorepoRoot);

/**
 * Telegram OIDC + Google/Apple OAuth + legacy widget + bundler CSP.
 * COOP must allow popup postMessage from oauth.telegram.org.
 */
const scriptSrc =
  "'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://oauth.telegram.org https://accounts.google.com https://appleid.cdn-apple.com https://static.cloudflareinsights.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  `script-src-elem ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https: wss: https://oauth.telegram.org https://accounts.google.com https://appleid.apple.com https://static.cloudflareinsights.com",
  "child-src 'self' https://oauth.telegram.org https://telegram.org https://accounts.google.com https://appleid.apple.com",
  "frame-src 'self' https://oauth.telegram.org https://telegram.org https://accounts.google.com https://appleid.apple.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://oauth.telegram.org https://accounts.google.com https://appleid.apple.com",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  output: "standalone",
  devIndicators: {
    position: "bottom-right",
  },
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  experimental: {
    cpus: buildCpus,
    staticGenerationRetryCount: 1,
    staticGenerationMaxConcurrency: buildCpus * 2,
    staticGenerationMinPagesPerWorker: 8,
    optimizePackageImports: [
      "@fortawesome/free-solid-svg-icons",
      "@fortawesome/free-regular-svg-icons",
      "@fortawesome/free-brands-svg-icons",
      "@coinbase/cds-icons",
      "@aws-sdk/client-s3",
      "viem",
      "wagmi",
    ],
  },
  async headers() {
    return [
      {
        source: "/push-sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
