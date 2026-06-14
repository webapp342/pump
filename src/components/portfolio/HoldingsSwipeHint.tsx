"use client";

import { useEffect, useState } from "react";
import { dismissHoldingsSwipeHint, isHoldingsSwipeHintDismissed } from "@/components/portfolio/HoldingSwipeRow";

export function HoldingsSwipeHint() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(isHoldingsSwipeHintDismissed());
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-pump-border/20 bg-pump-surface/40 px-2.5 py-2 lg:hidden">
      <p className="text-caption leading-snug text-pump-muted">
        Swipe right for <span className="font-medium text-pump-text">Buy max</span>, left for{" "}
        <span className="font-medium text-pump-text">Sell max</span>.
      </p>
      <button
        type="button"
        onClick={() => {
          dismissHoldingsSwipeHint();
          setDismissed(true);
        }}
        className="shrink-0 text-caption font-semibold text-pump-accent"
      >
        Got it
      </button>
    </div>
  );
}
