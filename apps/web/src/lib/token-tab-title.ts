import { formatPumpSubscriptPrice } from "@/lib/candles";

/** Browser tab segment before layout template `| Pump` — e.g. `$0.0₄12 | PEPE/USD`. */
export function formatTokenPageTitle(
  symbol: string,
  priceUsd: number | null | undefined
): string {
  const pair = `${symbol.toUpperCase()}/USD`;
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    return `— | ${pair}`;
  }

  const priceLabel =
    priceUsd >= 1
      ? `$${priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
      : formatPumpSubscriptPrice(priceUsd, "$");

  return `${priceLabel} | ${pair}`;
}

export function tokenDocumentTitle(symbol: string, priceUsd: number | null | undefined): string {
  return `${formatTokenPageTitle(symbol, priceUsd)} | Pump`;
}
