import { redirect } from "next/navigation";
import { resolveDefaultTradeHref } from "@/lib/trade-default";

/** Mobile Trade tab — opens the top market-cap token in trade mode. */
export default async function TradePage() {
  redirect(await resolveDefaultTradeHref());
}
