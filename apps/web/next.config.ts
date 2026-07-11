import type { NextConfig } from "next";
import path from "node:path";
import { withSerwist } from "@serwist/turbopack";
import { loadMonorepoRootEnv } from "./src/lib/load-monorepo-env";

/** Monorepo root — standalone tracing + turbopack resolve shared deps. */
const monorepoRoot = path.join(__dirname, "../..");

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
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: https://oauth.telegram.org https://accounts.google.com https://appleid.apple.com https://static.cloudflareinsights.com",
  "child-src 'self' https://oauth.telegram.org https://telegram.org https://accounts.google.com https://appleid.apple.com",
  "frame-src 'self' https://oauth.telegram.org https://telegram.org https://accounts.google.com https://appleid.apple.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://oauth.telegram.org https://accounts.google.com https://appleid.apple.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
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
        source: "/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          ...securityHeaders,
        ],
      },
      {
        source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|ico)$).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSerwist(nextConfig);
