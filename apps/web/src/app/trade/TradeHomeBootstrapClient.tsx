"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import {
  readLastTradeTokenAddress,
  writeLastTradeTokenCookie,
} from "@/lib/last-trade-token";
import { buildLastTradeTokenHref } from "@/lib/last-trade-token-cookie";

type TradeHomeBootstrapClientProps = {
  fallbackHref: string;
};

/** Client fallback when middleware and inline script did not redirect. */
export function TradeHomeBootstrapClient({ fallbackHref }: TradeHomeBootstrapClientProps) {
  const router = useRouter();

  useLayoutEffect(() => {
    const last = readLastTradeTokenAddress();
    if (last) {
      writeLastTradeTokenCookie(last);
      router.replace(buildLastTradeTokenHref(last));
      return;
    }
    if (fallbackHref !== "/" && fallbackHref !== `${window.location.pathname}${window.location.search}`) {
      router.replace(fallbackHref);
    }
  }, [fallbackHref, router]);

  return null;
}
