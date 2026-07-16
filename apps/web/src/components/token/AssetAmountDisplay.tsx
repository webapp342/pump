"use client";

import { BnbLogo } from "@/components/token/BnbLogo";
import { NATIVE_SYMBOL } from "@/config/chain";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import type { TokenLogoSizeRole } from "@/lib/ui-sizes";

type LogoSize = number | TokenLogoSizeRole;

export function BnbAmountDisplay({
  amount,
  logoSize = "xs",
  amountClassName = "financial-value font-medium tabular-nums text-pump-text",
  symbolClassName = "text-caption font-medium text-pump-muted",
}: {
  amount: string;
  logoSize?: LogoSize;
  amountClassName?: string;
  symbolClassName?: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center justify-end gap-1.5">
      <span className={`shrink-0 ${amountClassName}`}>{amount}</span>
      <BnbAssetChip size={logoSize} symbolClassName={symbolClassName} />
    </span>
  );
}

export function TokenAmountDisplay({
  amount,
  symbol,
  address,
  logoUrl,
  previewUrl,
  logoSize = "xs",
  amountClassName = "financial-value font-medium tabular-nums text-pump-text",
  symbolClassName = "text-caption font-medium text-pump-muted",
}: {
  amount: string;
  symbol: string;
  address?: string;
  logoUrl?: string | null;
  previewUrl?: string | null;
  logoSize?: LogoSize;
  amountClassName?: string;
  symbolClassName?: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center justify-end gap-1.5">
      <span className={`truncate ${amountClassName}`}>{amount}</span>
      <TokenAssetChip
        address={address ?? "0x0000000000000000000000000000000000000000"}
        symbol={symbol}
        logoUrl={logoUrl}
        previewUrl={previewUrl}
        size={logoSize}
        symbolClassName={symbolClassName}
      />
    </span>
  );
}

export function BnbAssetChip({
  size = "xs",
  symbolClassName = "text-caption font-medium text-pump-muted",
  className = "",
}: {
  size?: LogoSize;
  symbolClassName?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      <BnbLogo size={size} />
      <span className={symbolClassName}>{NATIVE_SYMBOL}</span>
    </span>
  );
}

export function TokenAssetChip({
  address,
  symbol,
  logoUrl,
  previewUrl,
  size = "xs",
  symbolClassName = "text-caption font-medium text-pump-muted",
  className = "",
}: {
  address: string;
  symbol: string;
  logoUrl?: string | null;
  previewUrl?: string | null;
  size?: LogoSize;
  symbolClassName?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      <TokenAvatar
        address={address}
        symbol={symbol}
        logoUrl={logoUrl}
        previewUrl={previewUrl}
        size={size}
        className="shrink-0"
      />
      <span className={`truncate ${symbolClassName}`}>{symbol}</span>
    </span>
  );
}

export function BnbAmountLabel({
  amount,
  logoSize = "xs",
}: {
  amount: string;
  logoSize?: LogoSize;
}) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span>{amount}</span>
      <BnbLogo size={logoSize} />
    </span>
  );
}

export function RewardAmountDisplay({
  amount,
  isBnb,
  token,
  amountClassName,
  logoSize,
}: {
  amount: string;
  isBnb: boolean;
  token?: { address: string; symbol: string; logoUrl?: string | null } | null;
  amountClassName?: string;
  logoSize?: LogoSize;
}) {
  if (amount === "—" || amount === "…") {
    return <span className="financial-value text-pump-text">{amount}</span>;
  }

  if (isBnb) {
    return (
      <BnbAmountDisplay amount={amount} amountClassName={amountClassName} logoSize={logoSize} />
    );
  }

  if (token) {
    return (
      <TokenAmountDisplay
        amount={amount}
        symbol={token.symbol}
        address={token.address}
        logoUrl={token.logoUrl}
        amountClassName={amountClassName}
        logoSize={logoSize}
      />
    );
  }

  return <span className="financial-value font-medium text-pump-text">{amount}</span>;
}
