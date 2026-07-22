/**
 * Redis Stream → ClickHouse flusher (F2).
 * Consumes pump:ch:trades and pump:ch:candles; inserts with async_insert + wait.
 */
import "dotenv/config";
import { Redis } from "ioredis";

const GROUP = "ch-flusher";
const CONSUMER = `flusher-${process.pid}`;
const BATCH = Number.parseInt(process.env.CH_FLUSHER_BATCH ?? "200", 10);
const POLL_MS = Number.parseInt(process.env.CH_FLUSHER_POLL_MS ?? "1500", 10);

const STREAMS = ["pump:ch:trades", "pump:ch:candles"] as const;

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function chInsertUrl(table: string): string {
  const base = required("CLICKHOUSE_URL").replace(/\/$/, "");
  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const settings =
    "async_insert=1,wait_for_async_insert=1,async_insert_busy_timeout_ms=3000";
  const query = `INSERT INTO ${table} SETTINGS ${settings} FORMAT JSONEachRow`;
  return `${base}/?database=${encodeURIComponent(database)}&query=${encodeURIComponent(query)}`;
}

function authHeader(): Record<string, string> {
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const pass = process.env.CLICKHOUSE_PASSWORD ?? "";
  if (!pass && user === "default") return {};
  return {
    authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
  };
}

async function flushRows(table: "trades_raw" | "candles_spot", rows: string[]): Promise<void> {
  if (rows.length === 0) return;
  const body = rows.join("\n");
  const res = await fetch(chInsertUrl(table), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader() },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CH insert ${table} ${res.status}: ${text.slice(0, 500)}`);
  }
}

function tradeRow(payload: Record<string, unknown>): string {
  return JSON.stringify({
    event_id: payload.event_id,
    token_address: payload.token_address,
    trader_address: payload.trader_address,
    side: payload.side,
    sol_amount: payload.sol_amount,
    token_amount: payload.token_amount,
    price_sol: payload.price_sol,
    spot_price_sol: payload.spot_price_sol,
    spot_before_sol: payload.spot_before_sol,
    fee_sol: payload.fee_sol,
    tx_hash: payload.tx_hash,
    log_index: payload.log_index,
    slot: payload.slot,
    block_time: String(payload.block_time).replace("T", " ").replace("Z", "").slice(0, 19),
    native_usd_rate: payload.native_usd_rate,
  });
}

function candleRow(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

async function ensureGroups(client: Redis): Promise<void> {
  for (const stream of STREAMS) {
    try {
      await client.xgroup("CREATE", stream, GROUP, "0", "MKSTREAM");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("BUSYGROUP")) throw err;
    }
  }
}

async function processStream(
  client: Redis,
  stream: (typeof STREAMS)[number]
): Promise<number> {
  const table = stream === "pump:ch:trades" ? "trades_raw" : "candles_spot";
  const reply = (await client.xreadgroup(
    "GROUP",
    GROUP,
    CONSUMER,
    "COUNT",
    BATCH,
    "BLOCK",
    100,
    "STREAMS",
    stream,
    ">"
  )) as [string, [string, string[]][]][] | null;
  if (!reply) return 0;

  let acked = 0;
  for (const [, entries] of reply) {
    const rows: string[] = [];
    const ids: string[] = [];
    for (const [id, fields] of entries) {
      const payloadIdx = fields.indexOf("payload");
      if (payloadIdx < 0 || payloadIdx + 1 >= fields.length) continue;
      const raw = fields[payloadIdx + 1];
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        rows.push(table === "trades_raw" ? tradeRow(parsed) : candleRow(parsed));
        ids.push(id);
      } catch {
        console.warn(`[ch-flusher] bad payload on ${stream} id=${id}`);
      }
    }
    if (rows.length > 0) {
      await flushRows(table, rows);
      for (const id of ids) {
        await client.xack(stream, GROUP, id);
        acked++;
      }
    }
  }
  return acked;
}

async function main(): Promise<void> {
  const redisUrl = required("REDIS_URL");
  const client = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  await ensureGroups(client);
  console.log("[ch-flusher] started", { consumer: CONSUMER, batch: BATCH });

  let running = true;
  process.on("SIGINT", () => {
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });

  while (running) {
    try {
      let total = 0;
      for (const stream of STREAMS) {
        total += await processStream(client, stream);
      }
      if (total > 0) {
        console.log(`[ch-flusher] flushed ${total} rows`);
      }
    } catch (err) {
      console.error("[ch-flusher] loop error", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  await client.quit();
}

main().catch((err) => {
  console.error("[ch-flusher] fatal", err);
  process.exit(1);
});
