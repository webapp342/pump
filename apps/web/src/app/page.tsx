import { resolveDefaultTradeHref } from "@/lib/trade-default";
import { TradeRedirectClient } from "@/app/trade/TradeRedirectClient";

/** App home — last visited token, or top market-cap when none saved yet. */
export default async function HomePage() {
  const fallbackHref = await resolveDefaultTradeHref();
  return <TradeRedirectClient fallbackHref={fallbackHref} />;
}
