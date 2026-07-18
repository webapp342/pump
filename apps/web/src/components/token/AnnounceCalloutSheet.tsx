"use client";

import { useEffect, useState } from "react";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { ANNOUNCE_MESSAGE_MAX_LEN } from "@/lib/token-announcements-shared";

export type AnnounceCalloutPhase = "confirm" | "submitting" | "success" | "error";

type AnnounceCalloutSheetProps = {
  open: boolean;
  onClose: () => void;
  phase: AnnounceCalloutPhase;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenLogoUrl?: string | null;
  errorMessage: string | null;
  successMultiplierX: number | null;
  message: string;
  onMessageChange: (value: string) => void;
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
  errorMessage,
  successMultiplierX,
  message,
  onMessageChange,
  onConfirm,
}: AnnounceCalloutSheetProps) {
  const [localMessage, setLocalMessage] = useState(message);

  useEffect(() => {
    if (open) setLocalMessage(message);
  }, [open, message]);

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
        : "Add a short note and notify your followers.";

  function commitMessage(value: string) {
    const next = value.slice(0, ANNOUNCE_MESSAGE_MAX_LEN);
    setLocalMessage(next);
    onMessageChange(next);
  }

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
          disabled={busy}
        >
          Try again
        </button>
      </div>
    ) : (
      <button
        type="button"
        className={`primary-button w-full${busy ? " form-submit-button--loading" : ""}`}
        onClick={onConfirm}
        disabled={busy}
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

        {phase === "confirm" || phase === "submitting" || phase === "error" ? (
          <div className="announce-callout-sheet__message">
            <label className="field-label" htmlFor="announce-callout-message">
              Description
            </label>
            <textarea
              id="announce-callout-message"
              className="field-textarea announce-callout-sheet__textarea"
              rows={3}
              maxLength={ANNOUNCE_MESSAGE_MAX_LEN}
              placeholder="Optional note for followers…"
              value={localMessage}
              disabled={busy}
              onChange={(e) => commitMessage(e.target.value)}
            />
            <p className="field-hint">
              {localMessage.length}/{ANNOUNCE_MESSAGE_MAX_LEN}
            </p>
          </div>
        ) : null}

        {phase === "confirm" || phase === "submitting" ? (
          <ul className="announce-callout-sheet__rules">
            <li>Market cap at announce is saved for the live X badge.</li>
            <li>Followers with callout alerts on will get a notification.</li>
          </ul>
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
