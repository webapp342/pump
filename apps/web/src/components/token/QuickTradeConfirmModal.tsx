"use client";

import {
  TradePanel,
  type TradeConfirmedPayload,
  type TradeOptimisticPayload,
  type TradeSubmittedPayload,
} from "@/components/token/TradePanel";
import type { BondingCurveSnapshot } from "@/lib/bonding-curve";
import type { TradePrefillConfig } from "@/lib/token-trade-prefill";

export type QuickTradeConfirmTarget = {
  tokenAddress: `0x${string}`;
  symbol: string;
  prefill: TradePrefillConfig;
  tokenBalanceWei?: bigint;
};

type QuickTradeConfirmModalProps = {
  target: QuickTradeConfirmTarget;
  onClose: () => void;
  onFundingBlocked?: () => void;
  onConfirmed?: () => void;
  status?: string;
  reserveBnb?: string;
  tokenSold?: string;
  chainCurveSnapshot?: BondingCurveSnapshot;
  progressBps?: number;
  graduated?: boolean;
  vaultTokenReserve?: string | null;
  wsConnected?: boolean;
  onTradeOptimistic?: (payload: TradeOptimisticPayload) => void;
  onTradeOptimisticRollback?: (payload: { pendingId: string }) => void;
  onTradeSubmitted?: (payload: TradeSubmittedPayload) => void;
  onTradeConfirmed?: (payload: TradeConfirmedPayload) => void;
};

/** Confirm-only quick trade — You pay / You receive before sending. */
export function QuickTradeConfirmModal({
  target,
  onClose,
  onFundingBlocked,
  onConfirmed,
  status = "",
  reserveBnb,
  tokenSold,
  chainCurveSnapshot,
  progressBps,
  graduated,
  vaultTokenReserve,
  wsConnected,
  onTradeOptimistic,
  onTradeOptimisticRollback,
  onTradeSubmitted,
  onTradeConfirmed,
}: QuickTradeConfirmModalProps) {
  return (
    <TradePanel
      confirmOnly
      tokenAddress={target.tokenAddress}
      symbol={target.symbol}
      status={status}
      reserveBnb={reserveBnb}
      tokenSold={tokenSold}
      chainCurveSnapshot={chainCurveSnapshot}
      progressBps={progressBps}
      graduated={graduated}
      vaultTokenReserve={vaultTokenReserve}
      wsConnected={wsConnected}
      prefill={target.prefill}
      overrideTokenBalanceWei={
        target.prefill.side === "sell" ? target.tokenBalanceWei : undefined
      }
      onConfirmOnlyClose={onClose}
      onConfirmOnlyFundingBlocked={onFundingBlocked}
      onTradeOptimistic={onTradeOptimistic}
      onTradeOptimisticRollback={onTradeOptimisticRollback}
      onTradeSubmitted={onTradeSubmitted}
      onTradeConfirmed={(payload) => {
        onTradeConfirmed?.(payload);
        onConfirmed?.();
        window.dispatchEvent(new Event("pump:activity"));
      }}
    />
  );
}
