"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TRADE_LAND_MS = 620;

/**
 * Detects newly landed trades (by id) and returns row animation classes.
 */
export function useLiveTradeAnimations(tradeIds: string[]) {
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [landingIds, setLandingIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      for (const id of tradeIds) seenRef.current.add(id);
      return;
    }

    const fresh = tradeIds.filter((id) => !seenRef.current.has(id));
    if (fresh.length === 0) {
      for (const id of tradeIds) seenRef.current.add(id);
      return;
    }

    for (const id of tradeIds) seenRef.current.add(id);

    setLandingIds(new Set(fresh));
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [
      setTimeout(() => setLandingIds(new Set()), TRADE_LAND_MS),
    ];
  }, [tradeIds]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, []);

  const rowClass = useCallback(
    (id: string, side: "BUY" | "SELL" | string, isOptimistic: boolean) => {
      const classes: string[] = [];
      if (isOptimistic) classes.push("live-trade-pending");
      if (landingIds.has(id)) {
        classes.push(side === "BUY" ? "live-trade-land-buy" : "live-trade-land-sell");
      }
      return classes.join(" ");
    },
    [landingIds]
  );

  return { rowClass, isLanding: (id: string) => landingIds.has(id) };
}
