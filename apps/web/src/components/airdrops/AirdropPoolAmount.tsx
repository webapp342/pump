"use client";

import { NativeLogo } from "@/components/token/NativeLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { formatAirdropRewardCompact } from "@/lib/airdrop-board-format";

type AirdropPoolAmountProps = {
  totalFunded: string;
  rewardToken: string | null;
  rewardSymbol: string | null;
  /** Campaign / pool token logo fallback when reward is ERC-20 without a clear mark. */
  linkedToken?: string | null;
  linkedSymbol?: string | null;
  size?: number;
  className?: string;
  amountClassName?: string;
  symbolClassName?: string;
};

/** Amount + reward asset mark + symbol (no leading $, no USD). */
export function AirdropPoolAmount({
  totalFunded,
  rewardToken,
  rewardSymbol,
  linkedToken = null,
  linkedSymbol = null,
  size = 14,
  className = "",
  amountClassName = "financial-value tabular-nums text-pump-text",
  symbolClassName = "text-pump-muted",
}: AirdropPoolAmountProps) {
  const isBnb = !rewardToken;
  const amount = formatAirdropRewardCompact(totalFunded);
  const markAddress = rewardToken ?? linkedToken;
  const markSymbol = rewardSymbol || linkedSymbol || "?";

  return (
    <span className={`airdrop-pool-amount inline-flex min-w-0 items-center gap-1 ${className}`.trim()}>
      <span className={`shrink-0 ${amountClassName}`.trim()}>{amount}</span>
      {isBnb ? (
        <NativeLogo size={size} className="airdrop-pool-amount__mark shrink-0" />
      ) : markAddress ? (
        <TokenAvatar
          address={markAddress}
          symbol={markSymbol}
          size={size}
          shape="rounded"
          className="airdrop-pool-amount__mark shrink-0 !ring-0"
        />
      ) : null}
      <span className={`min-w-0 truncate ${symbolClassName}`.trim()}>{markSymbol}</span>
    </span>
  );
}
