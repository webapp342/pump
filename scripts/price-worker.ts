#!/usr/bin/env tsx
/**
 * F7 — Poll Jupiter (Solana) / Binance / CoinGecko → Redis price:native:sol:usd
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Redis } from "ioredis";
import { REDIS_KEYS } from "@pump/xp";

const repoRoot =
  process.env.PUMP_REPO_ROOT?.trim() ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const INTERVAL_MS = Number.parseInt(process.env.PRICE_WORKER_INTERVAL_MS ?? "15000", 10);
const TTL_SEC = Number.parseInt(process.env.PRICE_WORKER_TTL_SEC ?? "60", 10);

async function fetchJupiterSolUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Record<string, { price?: string }>;
    };
    const price = Number(body.data?.So11111111111111111111111111111111111111112?.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fetchBinanceSolUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { price?: string };
    const price = Number(body.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoSolUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { solana?: { usd?: number } };
    const price = body.solana?.usd;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function tick(client: Redis): Promise<void> {
  const jup = await fetchJupiterSolUsd();
  const binance = jup == null ? await fetchBinanceSolUsd() : null;
  const coingecko = jup == null && binance == null ? await fetchCoinGeckoSolUsd() : null;
  const nativeUsd = jup ?? binance ?? coingecko;
  if (nativeUsd == null) {
    console.warn("[price-worker] all sources failed (jupiter, binance, coingecko)");
    return;
  }
  const source = jup != null ? "jupiter" : binance != null ? "binance" : "coingecko";
  const payload = JSON.stringify({
    nativeUsd,
    source,
    symbol: "SOL",
    fetchedAt: new Date().toISOString(),
  });
  await client.set(REDIS_KEYS.nativePriceSolUsd, payload, "EX", TTL_SEC);
  console.log("[price-worker]", payload);
}

async function main(): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error(`REDIS_URL required (repoRoot=${repoRoot})`);
  }
  console.log("[price-worker] start", {
    repoRoot,
    redis: url.replace(/:[^:@/]+@/, ":***@"),
    intervalMs: INTERVAL_MS,
    key: REDIS_KEYS.nativePriceSolUsd,
  });
  const client = new Redis(url);

  let running = true;
  process.on("SIGINT", () => {
    running = false;
  });

  while (running) {
    try {
      await tick(client);
    } catch (err) {
      console.error("[price-worker] tick error", err);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await client.quit();
}

main().catch((err) => {
  console.error("[price-worker] fatal", err);
  process.exit(1);
});
