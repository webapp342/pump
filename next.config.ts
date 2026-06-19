import type { NextConfig } from "next";
import path from "node:path";

const projectRoot = path.join(__dirname);

/**
 * Telegram Login Widget + bundler CSP.
 */
const scriptSrc = "'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  `script-src-elem ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https: wss: https://rpc.zerodev.app https://*.zerodev.app https://oauth.telegram.org",
  "child-src 'self' https://oauth.telegram.org",
  "frame-src 'self' https://oauth.telegram.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
