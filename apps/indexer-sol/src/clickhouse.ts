/**
 * Optional ClickHouse dual-write (OLAP candles/trades history).
 * On when CLICKHOUSE_URL is set, unless CLICKHOUSE_DUAL_WRITE=false.
 * Uses HTTP JSONEachRow insert (no paid SaaS; no hard SDK dependency).
 * PostgreSQL remains source of truth for positions / wallets.
 */

export function clickhouseDualWriteEnabled(): boolean {
  if (!process.env.CLICKHOUSE_URL?.trim()) return false;
  if (process.env.CLICKHOUSE_DUAL_WRITE === "false") return false;
  return true;
}

export type TradeChRow = {
  event_id: string;
  token_address: string;
  trader_address: string;
  side: string;
  sol_amount: number;
  token_amount: number;
  price_sol: number;
  spot_price_sol: number;
  fee_sol: number;
  tx_hash: string;
  log_index: number;
  slot: number;
  block_time: Date;
  native_usd_rate: number | null;
};

function authHeader(): string | undefined {
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const pass = process.env.CLICKHOUSE_PASSWORD ?? "";
  if (!pass && user === "default") return undefined;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

/** Fire-and-forget insert; never throws into the trade path. */
export function enqueueTradeClickHouse(row: TradeChRow): void {
  if (!clickhouseDualWriteEnabled()) return;

  const base = process.env.CLICKHOUSE_URL!.replace(/\/$/, "");
  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const url = `${base}/?database=${encodeURIComponent(database)}&query=${encodeURIComponent(
    "INSERT INTO trades_raw FORMAT JSONEachRow"
  )}`;

  const body = JSON.stringify({
    event_id: row.event_id,
    token_address: row.token_address,
    trader_address: row.trader_address,
    side: row.side,
    sol_amount: row.sol_amount,
    token_amount: row.token_amount,
    price_sol: row.price_sol,
    spot_price_sol: row.spot_price_sol,
    fee_sol: row.fee_sol,
    tx_hash: row.tx_hash,
    log_index: row.log_index,
    slot: row.slot,
    block_time: row.block_time.toISOString().replace("T", " ").replace("Z", ""),
    native_usd_rate: row.native_usd_rate,
  });

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const auth = authHeader();
  if (auth) headers.authorization = auth;

  void fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(5_000),
  }).catch((error) => {
    console.warn("[indexer-sol] ClickHouse trade insert failed", error);
  });
}
