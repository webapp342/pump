"use client";

import { useLayoutEffect, useState } from "react";
import { readLastTradeTokenAddress } from "@/lib/last-trade-token";
import { buildLastTradeTokenHref } from "@/lib/last-trade-token-cookie";

/** Trade tab / nav — last visited token, else `/` (bootstrap → server default). */
export function useTradeHomeHref(fallbackHref = "/"): string {
  const [href, setHref] = useState(fallbackHref);

  useLayoutEffect(() => {
    const last = readLastTradeTokenAddress();
    setHref(last ? buildLastTradeTokenHref(last) : fallbackHref);
  }, [fallbackHref]);

  return href;
}
