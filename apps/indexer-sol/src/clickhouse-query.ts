/**
 * Read-only ClickHouse HTTP queries for indexer (prior candle close, parity checks).
 */

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

export function clickhouseQueryEnabled(): boolean {
  return chBaseUrl() != null;
}

/** Latest authoritative 5m close for a token (candles_spot). */
export async function queryLatestCandleClose(
  tokenAddress: string,
  interval: string
): Promise<number | null> {
  const base = chBaseUrl();
  if (!base) return null;

  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const addr = tokenAddress.replace(/'/g, "\\'");
  const sql = `
    SELECT argMax(close_sol, updated_at) AS close_sol
    FROM candles_spot
    WHERE token_address = '${addr}'
      AND candle_interval = '${interval}'
    GROUP BY bucket_start
    ORDER BY bucket_start DESC
    LIMIT 1
    FORMAT JSONEachRow
  `.trim();

  try {
    const headers: Record<string, string> = {
      "content-type": "text/plain; charset=utf-8",
    };
    const auth = authHeader();
    if (auth) headers.authorization = auth;

    const res = await fetch(`${base}/?database=${encodeURIComponent(database)}`, {
      method: "POST",
      headers,
      body: sql,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    const row = JSON.parse(text.trim().split("\n")[0]!) as { close_sol?: number };
    const close = Number(row.close_sol);
    return Number.isFinite(close) && close > 0 ? close : null;
  } catch {
    return null;
  }
}

export type ChLatestCandleRow = {
  token_address: string;
  close_sol: number;
  low_sol: number;
  high_sol: number;
};

/** Latest 5m bucket OHLC per token — batch parity / wick checks. */
export async function queryLatestCandlesSpotBatch(
  interval = "5m"
): Promise<ChLatestCandleRow[]> {
  const base = chBaseUrl();
  if (!base) return [];

  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const sql = `
    SELECT
      token_address,
      close_sol,
      low_sol,
      high_sol
    FROM (
      SELECT
        token_address,
        argMax(close_sol, updated_at) AS close_sol,
        argMax(low_sol, updated_at) AS low_sol,
        argMax(high_sol, updated_at) AS high_sol,
        bucket_start,
        row_number() OVER (PARTITION BY token_address ORDER BY bucket_start DESC) AS rn
      FROM candles_spot
      WHERE candle_interval = '${interval}'
      GROUP BY token_address, bucket_start
    )
    WHERE rn = 1
    FORMAT JSONEachRow
  `.trim();

  try {
    const headers: Record<string, string> = {
      "content-type": "text/plain; charset=utf-8",
    };
    const auth = authHeader();
    if (auth) headers.authorization = auth;

    const res = await fetch(`${base}/?database=${encodeURIComponent(database)}`, {
      method: "POST",
      headers,
      body: sql,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim()) return [];
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ChLatestCandleRow);
  } catch {
    return [];
  }
}
