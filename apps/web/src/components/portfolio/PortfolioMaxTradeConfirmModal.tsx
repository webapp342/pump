"use client";

import {
  QuickTradeConfirmModal,
  type QuickTradeConfirmTarget,
} from "@/components/token/QuickTradeConfirmModal";

export type PortfolioMaxTradeTarget = {
  tokenAddress: `0x${string}`;
  symbol: string;
  side: "buy" | "sell";
  tokenBalanceWei?: bigint;
};

type PortfolioMaxTradeConfirmModalProps = {
  target: PortfolioMaxTradeTarget;
  onClose: () => void;
  onFundingBlocked: () => void;
  onConfirmed: () => void;
};

function toConfirmTarget(target: PortfolioMaxTradeTarget): QuickTradeConfirmTarget {
  return {
    tokenAddress: target.tokenAddress,
    symbol: target.symbol,
    tokenBalanceWei: target.tokenBalanceWei,
    prefill: {
      side: target.side,
      ...(target.side === "buy" ? { buyMax: true } : { sellMax: true }),
    },
  };
}

/** Portfolio Buy max / Sell max — confirm-only flow (no full trade sheet). */
export function PortfolioMaxTradeConfirmModal({
  target,
  onClose,
  onFundingBlocked,
  onConfirmed,
}: PortfolioMaxTradeConfirmModalProps) {
  return (
    <QuickTradeConfirmModal
      target={toConfirmTarget(target)}
      onClose={onClose}
      onFundingBlocked={onFundingBlocked}
      onConfirmed={onConfirmed}
    />
  );
}
