import { resolveDefaultTradeHref } from "@/lib/trade-default";
import { TradeRedirectClient } from "@/app/trade/TradeRedirectClient";

/** Mobile Trade tab — last visited token, or top market-cap when none saved yet. */
export default async function TradePage() {
  const fallbackHref = await resolveDefaultTradeHref();
  return <TradeRedirectClient fallbackHref={fallbackHref} />;
}
