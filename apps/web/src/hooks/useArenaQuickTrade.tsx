"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { QuickTradeConfirmModal } from "@/components/token/QuickTradeConfirmModal";
import { TradeSheet } from "@/components/token/TradeSheet";
import { buildArenaQuickTradePrefill } from "@/lib/arena-quick-trade";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";

type ArenaQuickTradeTarget = {
  tokenAddress: `0x${string}`;
  symbol: string;
  side: "buy" | "sell";
};

export function useArenaQuickTrade() {
  const [target, setTarget] = useState<ArenaQuickTradeTarget | null>(null);
  const [fundingBlockedTarget, setFundingBlockedTarget] =
    useState<ArenaQuickTradeTarget | null>(null);
  const { isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();

  const openQuickTrade = useCallback(
    (tokenAddress: string, symbol: string, side: "buy" | "sell") => {
      if (!isConnected) {
        openConnectModal?.();
        return;
      }
      setTarget({
        tokenAddress: tokenAddress.toLowerCase() as `0x${string}`,
        symbol,
        side,
      });
    },
    [isConnected, openConnectModal]
  );

  const closeQuickTrade = useCallback(() => setTarget(null), []);

  const quickTradeSheet = (
    <>
      {target ? (
        <QuickTradeConfirmModal
          key={`${target.tokenAddress}-${target.side}-confirm`}
          target={{
            tokenAddress: target.tokenAddress,
            symbol: target.symbol,
            prefill: buildArenaQuickTradePrefill(target.side),
          }}
          onClose={closeQuickTrade}
          onFundingBlocked={() => {
            setFundingBlockedTarget(target);
            closeQuickTrade();
          }}
          onConfirmed={closeQuickTrade}
        />
      ) : null}
      {fundingBlockedTarget ? (
        <TradeSheet
          key={`${fundingBlockedTarget.tokenAddress}-${fundingBlockedTarget.side}-sheet`}
          open
          presentation="modal"
          onClose={() => setFundingBlockedTarget(null)}
          tokenAddress={fundingBlockedTarget.tokenAddress}
          symbol={fundingBlockedTarget.symbol}
          status=""
          prefill={buildArenaQuickTradePrefill(fundingBlockedTarget.side)}
          onTradeConfirmed={() => {
            setFundingBlockedTarget(null);
            window.dispatchEvent(new Event("pump:activity"));
          }}
        />
      ) : null}
    </>
  );

  return {
    openQuickTrade,
    closeQuickTrade,
    quickTradeSheet,
    hasQuickTrade: target != null || fundingBlockedTarget != null,
  };
}
