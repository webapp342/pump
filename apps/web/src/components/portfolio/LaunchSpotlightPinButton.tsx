"use client";

import { useState } from "react";
import {
  isTokenSpotlightPinned,
  useLaunchSpotlightPins,
} from "@/hooks/useLaunchSpotlightPins";
import { LAUNCH_SPOTLIGHT_ITEM_ID } from "@/lib/points-perk-effects";

type LaunchSpotlightPinButtonProps = {
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  usableCount: number;
  onUsed?: () => void;
  className?: string;
};

export function LaunchSpotlightPinButton({
  walletAddress,
  tokenAddress,
  tokenSymbol,
  usableCount,
  onUsed,
  className = "",
}: LaunchSpotlightPinButtonProps) {
  const { byToken, refresh } = useLaunchSpotlightPins();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinned = isTokenSpotlightPinned(tokenAddress, byToken);

  async function onPin() {
    if (busy || pinned || usableCount < 1) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/missions/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          itemId: LAUNCH_SPOTLIGHT_ITEM_ID,
          tokenAddress,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not pin launch");
      }
      refresh();
      onUsed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pin launch");
    } finally {
      setBusy(false);
    }
  }

  if (pinned) {
    return (
      <span
        className={`token-spotlight-badge token-spotlight-badge--active ${className}`.trim()}
        title={`${tokenSymbol} is pinned in Arena`}
      >
        Pinned
      </span>
    );
  }

  if (usableCount < 1) {
    return null;
  }

  return (
    <span className={`portfolio-launch-pin ${className}`.trim()}>
      <button
        type="button"
        className="portfolio-launch-pin__btn"
        onClick={() => void onPin()}
        disabled={busy}
        aria-label={`Pin ${tokenSymbol} in Arena for 24 hours`}
      >
        {busy ? "Pinning…" : "Pin 24h"}
      </button>
      {error ? <span className="portfolio-launch-pin__error">{error}</span> : null}
    </span>
  );
}
