"use client";

import { useEffect } from "react";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import {
  ANNOUNCE_HOLDINGS_ERROR,
  ANNOUNCE_MIN_TOKEN_BALANCE,
} from "@/lib/token-announcements-shared";

export type AnnounceCalloutPhase = "confirm" | "submitting" | "success" | "error";

type AnnounceCalloutSheetProps = {
  open: boolean;
  onClose: () => void;
  phase: AnnounceCalloutPhase;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenLogoUrl?: string | null;
  canAnnounceHoldings: boolean;
  holdingsLoading: boolean;
  errorMessage: string | null;
  successMultiplierX: number | null;
  onConfirm: () => void;
};

function formatMultiplierX(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 100) return `${value.toFixed(0)}x`;
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

export function AnnounceCalloutSheet({
  open,
  onClose,
  phase,
  tokenAddress,
  tokenSymbol,
  tokenName,
  tokenLogoUrl = null,
  canAnnounceHoldings,
  holdingsLoading,
  errorMessage,
  successMultiplierX,
  onConfirm,
}: AnnounceCalloutSheetProps) {
  useEffect(() => {
    if (!open || phase !== "success") return;
    const timer = window.setTimeout(() => onClose(), 2200);
    return () => window.clearTimeout(timer);
  }, [open, phase, onClose]);

  const xLabel = formatMultiplierX(successMultiplierX);
  const busy = phase === "submitting";
  const title =
    phase === "success"
      ? "Callout posted"
      : phase === "error"
        ? "Callout failed"
        : "Announce callout";

  const subtitle =
    phase === "success"
      ? xLabel
        ? `Announced at ${xLabel} · added to Callouts.`
        : "Added to your Callouts."
      : phase === "error"
        ? errorMessage ?? "Could not announce this token."
        : "Notify followers and record a snapshot on this token.";

  const footer =
    phase === "success" ? (
      <button type="button" className="primary-button w-full" onClick={onClose}>
        Done
      </button>
    ) : phase === "error" ? (
      <div className="flex w-full gap-2">
        <button type="button" className="secondary-button min-w-0 flex-1" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="primary-button min-w-0 flex-1"
          onClick={onConfirm}
          disabled={busy || !canAnnounceHoldings}
        >
          Try again
        </button>
      </div>
    ) : (
      <button
        type="button"
        className={`primary-button w-full${busy ? " form-submit-button--loading" : ""}`}
        onClick={onConfirm}
        disabled={busy || holdingsLoading || !canAnnounceHoldings}
        aria-busy={busy}
      >
        {busy ? (
          <>
            <span className="trade-submit-spinner" aria-hidden />
            <span>Announcing…</span>
          </>
        ) : (
          "Announce"
        )}
      </button>
    );

  return (
    <AppBottomSheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      ariaLabel={title}
      title={title}
      subtitle={subtitle}
      footer={footer}
      panelClassName="max-w-md"
      hideCloseButton={busy}
    >
      <div className="announce-callout-sheet">
        <div className="announce-callout-sheet__token">
          <TokenAvatar
            address={tokenAddress}
            symbol={tokenSymbol}
            logoUrl={tokenLogoUrl}
            size="lg"
            shape="rounded"
          />
          <div className="announce-callout-sheet__token-copy min-w-0">
            <p className="announce-callout-sheet__token-name">{tokenName}</p>
            <p className="announce-callout-sheet__token-symbol">{tokenSymbol}</p>
          </div>
        </div>

        {phase === "confirm" || phase === "submitting" ? (
          <ul className="announce-callout-sheet__rules">
            <li>
              Hold at least {ANNOUNCE_MIN_TOKEN_BALANCE} {tokenSymbol} to announce.
            </li>
            <li>Your balance and USD value are saved as a snapshot with the callout.</li>
            <li>Followers with callout alerts on will get a notification.</li>
          </ul>
        ) : null}

        {phase === "confirm" || phase === "submitting" || phase === "error" ? (
          <p
            className={`announce-callout-sheet__status${
              canAnnounceHoldings
                ? " announce-callout-sheet__status--ok"
                : " announce-callout-sheet__status--blocked"
            }`}
          >
            {holdingsLoading
              ? "Checking your balance…"
              : canAnnounceHoldings
                ? `You're eligible — balance is at least ${ANNOUNCE_MIN_TOKEN_BALANCE} ${tokenSymbol}.`
                : ANNOUNCE_HOLDINGS_ERROR}
          </p>
        ) : null}

        {phase === "error" && errorMessage ? (
          <p className="announce-callout-sheet__error notice-error px-3 py-2 text-caption" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </AppBottomSheet>
  );
}
