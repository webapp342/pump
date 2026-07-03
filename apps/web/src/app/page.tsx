import { resolveDefaultTradeHref } from "@/lib/trade-default";
import { TradeHomeBootstrap } from "@/app/trade/TradeHomeBootstrap";

/** App home — last visited token, or top market-cap when none saved yet. */
export default async function HomePage() {
  const fallbackHref = await resolveDefaultTradeHref();
  return <TradeHomeBootstrap fallbackHref={fallbackHref} />;
}
