"use client";

import { TradePanel } from "@/components/token/TradePanel";

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

/** Portfolio Buy max / Sell max — confirm-only flow (no full trade sheet). */
export function PortfolioMaxTradeConfirmModal({
  target,
  onClose,
  onFundingBlocked,
  onConfirmed,
}: PortfolioMaxTradeConfirmModalProps) {
  return (
    <TradePanel
      confirmOnly
      tokenAddress={target.tokenAddress}
      symbol={target.symbol}
      status=""
      prefill={{
        side: target.side,
        ...(target.side === "buy" ? { buyMax: true } : { sellMax: true }),
      }}
      overrideTokenBalanceWei={
        target.side === "sell" ? target.tokenBalanceWei : undefined
      }
      onConfirmOnlyClose={onClose}
      onConfirmOnlyFundingBlocked={onFundingBlocked}
      onTradeConfirmed={() => {
        onConfirmed();
        window.dispatchEvent(new Event("pump:activity"));
      }}
    />
  );
}
