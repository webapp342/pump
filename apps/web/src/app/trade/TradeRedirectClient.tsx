"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastTradeTokenAddress } from "@/lib/last-trade-token";

type TradeRedirectClientProps = {
  fallbackHref: string;
};

/** Trade tab — last visited token when known, else top market-cap fallback from server. */
export function TradeRedirectClient({ fallbackHref }: TradeRedirectClientProps) {
  const router = useRouter();

  useEffect(() => {
    const last = readLastTradeTokenAddress();
    router.replace(last ? `/token/${last}?trade=buy` : fallbackHref);
  }, [fallbackHref, router]);

  return null;
}
