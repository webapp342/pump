import { resolveDefaultTradeHref } from "@/lib/trade-default";
import { TradeHomeBootstrap } from "@/app/trade/TradeHomeBootstrap";

/** Legacy Trade tab URL — same bootstrap as `/`. */
export default async function TradePage() {
  const fallbackHref = await resolveDefaultTradeHref();
  return <TradeHomeBootstrap fallbackHref={fallbackHref} />;
}
