/**
 * ClickHouse HTTP helpers (self-hosted). Used by web chart history + indexer dual-write.
 * No paid SaaS SDK — plain fetch.
 */

export function clickhouseConfigured(): boolean {
  return Boolean(process.env.CLICKHOUSE_URL?.trim());
}

export function clickhouseCandlesEnabled(): boolean {
  if (process.env.USE_CLICKHOUSE_CANDLES === "false") return false;
  if (process.env.USE_CLICKHOUSE_CANDLES === "true") return clickhouseConfigured();
  // Default on when URL is set (activation script sets both).
  return clickhouseConfigured();
}

function authHeader(): string | undefined {
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const pass = process.env.CLICKHOUSE_PASSWORD ?? "";
  if (!pass && user === "default") return undefined;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export async function clickhouseQueryJson<T extends Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const base = process.env.CLICKHOUSE_URL!.replace(/\/$/, "");
  const database = process.env.CLICKHOUSE_DATABASE ?? "pump";
  const url = `${base}/?database=${encodeURIComponent(database)}&default_format=JSONEachRow`;
  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
  };
  const auth = authHeader();
  if (auth) headers.authorization = auth;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: sql,
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ClickHouse ${res.status}: ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
