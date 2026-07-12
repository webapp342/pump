import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const monorepoRoot = path.resolve(__dirname, "../..");
  const webSrc = path.resolve(__dirname, "../web/src");
  const env = loadEnv(mode, monorepoRoot, "");

  const rawChainId = env.NEXT_PUBLIC_CHAIN_ID ?? "84532";
  const chainId = Number(rawChainId) === 84 ? "84532" : rawChainId;
  const rpcUrl =
    env.NEXT_PUBLIC_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545";
  const tmaPort = env.VITE_PUMP_API_PORT ?? env.PORT ?? "3012";
  const apiTarget = env.VITE_PUMP_API_URL ?? `http://127.0.0.1:${tmaPort}`;
  const adminBase = env.VITE_ADMIN_BASE ?? (mode === "production" ? "/admin/" : "/");

  return {
    base: adminBase,
    plugins: [react()],
    resolve: {
      dedupe: ["viem", "wagmi", "valtio", "@tanstack/react-query", "react", "react-dom"],
      alias: {
        "@": webSrc,
        buffer: "buffer",
        "next/link": path.resolve(__dirname, "src/shims/next-link.tsx"),
        "next/font/local": path.resolve(__dirname, "src/shims/next-font-local.ts"),
      },
    },
    define: {
      "process.env.NEXT_PUBLIC_CHAIN_ID": JSON.stringify(chainId),
      "process.env.NEXT_PUBLIC_RPC_URL": JSON.stringify(rpcUrl),
      "process.env.NEXT_PUBLIC_MEME_FACTORY": JSON.stringify(env.NEXT_PUBLIC_MEME_FACTORY ?? ""),
      "process.env.NEXT_PUBLIC_BONDING_CURVE_MANAGER": JSON.stringify(
        env.NEXT_PUBLIC_BONDING_CURVE_MANAGER ?? ""
      ),
      "process.env.NEXT_PUBLIC_AIRDROP_MANAGER": JSON.stringify(
        env.NEXT_PUBLIC_AIRDROP_MANAGER ?? ""
      ),
      "process.env.NEXT_PUBLIC_ADMIN_ADDRESS": JSON.stringify(
        env.NEXT_PUBLIC_ADMIN_ADDRESS ?? ""
      ),
      "process.env.NEXT_PUBLIC_LAUNCHPAD_TREASURY": JSON.stringify(
        env.NEXT_PUBLIC_LAUNCHPAD_TREASURY ?? ""
      ),
    },
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
