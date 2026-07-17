"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AIRDROP_WEIGHT_ITEM_ID,
  AIRDROP_WEIGHT_MULTIPLIER,
} from "@/lib/points-perk-effects";

type AirdropMultiplierCardProps = {
  airdropId: string;
  walletAddress: string | null;
  guestMode?: boolean;
  onApplied?: () => void;
};

export function AirdropMultiplierCard({
  airdropId,
  walletAddress,
  guestMode = false,
  onApplied,
}: AirdropMultiplierCardProps) {
  const [usable, setUsable] = useState(0);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!guestMode && Boolean(walletAddress));

  const refresh = useCallback(async () => {
    if (guestMode || !walletAddress) {
      setUsable(0);
      setApplied(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [invRes, statusRes] = await Promise.all([
        fetch(`/api/missions/inventory?address=${encodeURIComponent(walletAddress)}`, {
          cache: "no-store",
        }),
        fetch(
          `/api/airdrops/${encodeURIComponent(airdropId)}/weight-status?address=${encodeURIComponent(walletAddress)}`,
          { cache: "no-store" }
        ),
      ]);
      const invBody = (await invRes.json()) as {
        data?: { inventory?: Array<{ itemId: string }> };
      };
      const statusBody = (await statusRes.json()) as {
        data?: { applied?: boolean };
      };
      const count = (invBody.data?.inventory ?? []).filter(
        (row) => row.itemId === AIRDROP_WEIGHT_ITEM_ID
      ).length;
      setUsable(count);
      setApplied(Boolean(statusBody.data?.applied));
      setError(null);
    } catch {
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [airdropId, guestMode, walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onApply() {
    if (!walletAddress || busy || applied || usable < 1) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/missions/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          itemId: AIRDROP_WEIGHT_ITEM_ID,
          airdropId,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not apply multiplier");
      setApplied(true);
      setUsable((n) => Math.max(0, n - 1));
      onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply multiplier");
    } finally {
      setBusy(false);
    }
  }

  if (guestMode || !walletAddress) return null;
  if (loading) return null;
  if (!applied && usable < 1) return null;

  return (
    <div className="airdrop-multiplier-card panel-surface">
      <div className="airdrop-multiplier-card__copy">
        <p className="airdrop-multiplier-card__title">Airdrop multiplier</p>
        <p className="airdrop-multiplier-card__body text-caption text-pump-muted">
          {applied
            ? `${AIRDROP_WEIGHT_MULTIPLIER}× score is active on this campaign.`
            : `Apply your perk for ${AIRDROP_WEIGHT_MULTIPLIER}× score on this campaign (one use).`}
        </p>
      </div>
      {applied ? (
        <span className="airdrop-multiplier-card__badge">Applied</span>
      ) : (
        <button
          type="button"
          className="chip-button chip-button-active airdrop-multiplier-card__cta"
          onClick={() => void onApply()}
          disabled={busy}
        >
          {busy ? "Applying…" : `Apply ${AIRDROP_WEIGHT_MULTIPLIER}×`}
        </button>
      )}
      {error ? <p className="airdrop-multiplier-card__error notice-error text-caption">{error}</p> : null}
    </div>
  );
}
