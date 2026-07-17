"use client";

import { TokenAvatar } from "@/components/token/TokenAvatar";
import {
  formatAnnounceBalance,
  type TokenAnnouncementRow,
} from "@/lib/token-announcements-shared";
import { formatUsdReadable } from "@/lib/format-usd";

type CalloutHoldingsSnapshotProps = {
  tokenAddress: string;
  tokenSymbol: string;
  tokenLogoUrl?: string | null;
  balance: TokenAnnouncementRow["tokenBalanceAtAnnounce"];
  balanceUsd: TokenAnnouncementRow["tokenBalanceUsdAtAnnounce"];
  className?: string;
};

/** Frozen holdings line under callout identity — no live fetches. */
export function CalloutHoldingsSnapshot({
  tokenAddress,
  tokenSymbol,
  tokenLogoUrl = null,
  balance,
  balanceUsd,
  className = "",
}: CalloutHoldingsSnapshotProps) {
  if (balance == null || !Number.isFinite(balance) || balance <= 0) {
    return null;
  }

  const usdLabel =
    balanceUsd != null && Number.isFinite(balanceUsd) && balanceUsd > 0
      ? formatUsdReadable(balanceUsd, { compact: true })
      : null;

  return (
    <span className={`callout-holdings-snapshot ${className}`.trim()}>
      <TokenAvatar
        address={tokenAddress}
        symbol={tokenSymbol}
        logoUrl={tokenLogoUrl}
        size="xs"
        shape="rounded"
        className="callout-holdings-snapshot__logo"
      />
      <span className="callout-holdings-snapshot__amount financial-value">
        {formatAnnounceBalance(balance)}
      </span>
      {usdLabel ? (
        <span className="callout-holdings-snapshot__usd financial-value">({usdLabel})</span>
      ) : null}
    </span>
  );
}
