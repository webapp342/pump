"use client";

import {
  formatAnnounceBalance,
  type TokenAnnouncementRow,
} from "@/lib/token-announcements-shared";
import { formatUsdReadable } from "@/lib/format-usd";

type CalloutHoldingsSnapshotProps = {
  balance: TokenAnnouncementRow["tokenBalanceAtAnnounce"];
  balanceUsd: TokenAnnouncementRow["tokenBalanceUsdAtAnnounce"];
  className?: string;
};

/** Frozen holdings line — amount only (no mini token logo; row already has the tile). */
export function CalloutHoldingsSnapshot({
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
      <span className="callout-holdings-snapshot__amount financial-value">
        {formatAnnounceBalance(balance)}
      </span>
      {usdLabel ? (
        <span className="callout-holdings-snapshot__usd financial-value">({usdLabel})</span>
      ) : null}
    </span>
  );
}
