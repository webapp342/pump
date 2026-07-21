/**
 * Authoritative spot OHLC dual-write to ClickHouse (same rows as PG token_candles upsert).
 * Fire-and-forget — never blocks the trade transaction.
 */

import type { CandleWsUpdatePayload } from "./redis-types.js";
import { clickhouseDualWriteEnabled } from "./clickhouse.js";

function authHeader(): string | undefined {
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const pass = process.env.CLICKHOUSE_PASSWORD ?? "";
  if (!pass && user === "default") return undefined;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function chBaseUrl(): string | null {
  const raw = process.env.CLICKHOUSE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

type ChCandleRow = {
  token_address: string;
  candle_interval: string;
  bucket_start: string;
  open_sol: number;
  high_sol: number;
  low_sol: number;
  close_sol: number;
  volume_sol: number;
  buy_volume_sol: number;
  trade_count: number;
};

function bucketStartIso(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function candleRowToCh(
  tokenAddress: string,
  update: CandleWsUpdatePayload
): ChCandleRow | null {
  const open = Number(update.open);
  const high = Number(update.high);
  const low = Number(update.low);
  const close = Number(update.close);
  const volume = Number(update.volume);
  const buyVolume = Number(update.buyVolume);
  if (!(close > 0) || !Number.isFinite(close)) return null;

  return {
    token_address: tokenAddress,
    candle_interval: update.interval,
    bucket_start: bucketStartIso(update.time),
    open_sol: open,
    high_sol: high,
    low_sol: low,
    close_sol: close,
    volume_sol: Number.isFinite(volume) ? volume : 0,
    buy_volume_sol: Number.isFinite(buyVolume) ? buyVolume : 0,
    trade_count: update.tradeCount,
  };
}

/** Batch insert authoritative OHLC buckets (ReplacingMergeTree dedupes on merge). */
export function enqueueCandlesClickHouse(
  tokenAddress: string,
  updates: CandleWsUpdatePayload[]
): void {
  if (!clickhouseDualWriteEnabled() || updates.length === 0) return;

  const base = chBaseUrl();
  if (!base) return;

  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const rows = updates
    .map((u) => candleRowToCh(tokenAddress, u))
    .filter((r): r is ChCandleRow => r != null);
  if (rows.length === 0) return;

  const url = `${base}/?database=${encodeURIComponent(database)}&query=${encodeURIComponent(
    "INSERT INTO candles_spot FORMAT JSONEachRow"
  )}`;

  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const auth = authHeader();
  if (auth) headers.authorization = auth;

  void fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(8_000),
  }).catch((error) => {
    console.warn("[indexer-sol] ClickHouse candles_spot insert failed", error);
  });
}
