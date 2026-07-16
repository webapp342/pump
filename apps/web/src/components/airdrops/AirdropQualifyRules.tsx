"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import { FieldErrorIcon, FieldErrorMessage } from "@/components/ui/FieldError";
import type { TokenListItem } from "@/lib/db/launchpad";
import { NATIVE_SYMBOL } from "@/config/chain";
import { BnbLogo } from "@/components/token/BnbLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TOKEN_LOGO_SIZE, type TokenLogoSizeRole } from "@/lib/ui-sizes";

function resolveLogoPx(size: number | TokenLogoSizeRole | undefined): number {
  if (size == null) return TOKEN_LOGO_SIZE["2xl"];
  if (typeof size === "number") return size;
  return TOKEN_LOGO_SIZE[size];
}

function PoolTokenAvatar({
  token,
  size = "2xl",
  className = "",
}: {
  token: TokenListItem | null;
  size?: number | TokenLogoSizeRole;
  className?: string;
}) {
  const px = resolveLogoPx(size);
  if (!token) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full border border-dashed border-pump-border/30 bg-pump-surface/40 type-caption text-pump-muted ${className}`}
        style={{ width: px, height: px }}
      >
        ?
      </div>
    );
  }

  return (
    <TokenAvatar
      address={token.address}
      symbol={token.symbol}
      logoUrl={token.logoUrl}
      size={size}
      className={`shrink-0 ${className}`.trim()}
    />
  );
}

function formatHoldAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

type AirdropQualifyRulesEditorProps = {
  linkedToken: TokenListItem | null;
  minHoldTokens: string;
  minBuyBnb: string;
  onMinHoldChange: (value: string) => void;
  onMinBuyChange: (value: string) => void;
  /** When provided, min buy is edited in USD (BNB still stored via onMinBuyChange). */
  minBuyUsdInput?: string | null;
  onMinBuyUsdChange?: (value: string) => void;
  minBuyAssetHint?: string | null;
  holdUsdHint?: string | null;
  error?: string | null;
  holdError?: string | null;
  buyError?: string | null;
};

export function AirdropQualifyRulesEditor({
  linkedToken,
  minHoldTokens,
  minBuyBnb,
  onMinHoldChange,
  onMinBuyChange,
  minBuyUsdInput = null,
  onMinBuyUsdChange,
  minBuyAssetHint = null,
  holdUsdHint = null,
  error = null,
  holdError = null,
  buyError = null,
}: AirdropQualifyRulesEditorProps) {
  const symbol = linkedToken?.symbol ?? "TOKEN";
  const holdInvalid = Boolean(holdError);
  const buyInvalid = Boolean(buyError);
  const groupError = Boolean(error) && !holdInvalid && !buyInvalid;
  const buyInUsd = minBuyUsdInput != null && onMinBuyUsdChange != null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={holdInvalid || groupError ? "field-group--error" : undefined}>
          <label className="field-label inline-flex items-center gap-1" htmlFor="minHold">
            Min hold · {symbol}
            <InfoTip label="About min hold">
              Minimum {symbol} balance in wallet when qualification ends.
            </InfoTip>
          </label>
          <div
            className={`field-control mt-1${holdInvalid || groupError ? " field-control--error" : ""}`}
          >
            <input
              id="minHold"
              inputMode="decimal"
              className={`field-input financial-value${
                holdInvalid || groupError ? " field-input--error" : ""
              }`}
              value={minHoldTokens}
              onChange={(e) => onMinHoldChange(e.target.value)}
              placeholder="e.g. 1000"
              aria-invalid={holdInvalid || groupError || undefined}
            />
            {holdInvalid || groupError ? <FieldErrorIcon /> : null}
          </div>
          {holdUsdHint && !holdError ? (
            <p className="mt-1 field-hint airdrop-create-field-meta">
              ≈ <span className="financial-value text-pump-text">{holdUsdHint}</span>
            </p>
          ) : null}
          <FieldErrorMessage>{holdError}</FieldErrorMessage>
        </div>

        <div className={buyInvalid || groupError ? "field-group--error" : undefined}>
          <label className="field-label inline-flex items-center gap-1" htmlFor="minBuy">
            Min buy · {buyInUsd ? "USD" : NATIVE_SYMBOL}
            <InfoTip label="About min buy volume">
              Total buy volume required to qualify during this campaign window (fees excluded).
            </InfoTip>
          </label>
          <div
            className={`relative mt-1 field-control${
              buyInvalid || groupError
                ? " field-control--error field-control--error-with-suffix"
                : ""
            }`}
          >
            {!buyInUsd ? (
              <div className="pointer-events-none absolute inset-y-0 left-3 z-[1] flex items-center">
                <BnbLogo size="xs" />
              </div>
            ) : (
              <span className="pointer-events-none absolute inset-y-0 left-3 z-[1] flex items-center text-caption font-medium text-pump-muted">
                $
              </span>
            )}
            <input
              id="minBuy"
              inputMode="decimal"
              className={`field-input financial-value pr-14${
                buyInUsd ? " pl-7" : " pl-10"
              }${buyInvalid || groupError ? " field-input--error" : ""}`}
              value={buyInUsd ? minBuyUsdInput : minBuyBnb}
              onChange={(e) =>
                buyInUsd ? onMinBuyUsdChange(e.target.value) : onMinBuyChange(e.target.value)
              }
              placeholder={buyInUsd ? "0.00" : "0.01"}
              aria-invalid={buyInvalid || groupError || undefined}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 z-[1] -translate-y-1/2 text-caption font-medium text-pump-muted">
              {buyInUsd ? "USD" : NATIVE_SYMBOL}
            </span>
            {buyInvalid || groupError ? <FieldErrorIcon /> : null}
          </div>
          {minBuyAssetHint && !buyError ? (
            <p className="mt-1 field-hint airdrop-create-field-meta airdrop-create-field-meta--end">
              ≈ <span className="financial-value text-pump-text">{minBuyAssetHint}</span>
            </p>
          ) : null}
          <FieldErrorMessage>{buyError}</FieldErrorMessage>
        </div>
      </div>

      <FieldErrorMessage>{error}</FieldErrorMessage>

      {!linkedToken ? (
        <p className="text-caption text-pump-muted">Select a pool token to name these rules.</p>
      ) : null}
    </div>
  );
}

type AirdropQualifyRulesPreviewProps = {
  linkedToken: TokenListItem | null;
  minHoldTokens: string;
  minBuyBnb: string;
  minBuyUsdLabel?: string | null;
  holdUsdLabel?: string | null;
};

export function AirdropQualifyRulesPreview({
  linkedToken,
  minHoldTokens,
  minBuyBnb,
  minBuyUsdLabel = null,
  holdUsdLabel = null,
}: AirdropQualifyRulesPreviewProps) {
  const hasHold = minHoldTokens.trim().length > 0;
  const hasBuy = minBuyBnb.trim().length > 0;
  const symbol = linkedToken?.symbol ?? "TOKEN";

  if (!hasHold && !hasBuy) {
    return <span className="text-pump-muted">—</span>;
  }

  return (
    <div className="flex items-start justify-end gap-2">
      <p className="min-w-0 text-right text-caption leading-snug text-pump-text">
        {hasHold ? (
          <>
            Hold ≥ {formatHoldAmount(minHoldTokens)}{" "}
            <span className="font-medium text-pump-accent">{symbol}</span>
            {holdUsdLabel ? (
              <span className="text-pump-muted"> ({holdUsdLabel})</span>
            ) : null}
          </>
        ) : null}
        {hasHold && hasBuy ? <span className="text-pump-muted"> · </span> : null}
        {hasBuy ? (
          <>
            Buy ≥ {minBuyUsdLabel ?? `${minBuyBnb} ${NATIVE_SYMBOL}`}{" "}
            <span className="text-pump-muted">of</span>{" "}
            <span className="font-medium text-pump-accent">{symbol}</span>
          </>
        ) : null}
      </p>
      <PoolTokenAvatar token={linkedToken} size="sm" className="mt-0.5 shrink-0" />
    </div>
  );
}
