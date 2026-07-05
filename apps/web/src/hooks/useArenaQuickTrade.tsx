"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
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

  const quickTradeSheet = target ? (
    <TradeSheet
      key={`${target.tokenAddress}-${target.side}`}
      open
      presentation="modal"
      onClose={closeQuickTrade}
      tokenAddress={target.tokenAddress}
      symbol={target.symbol}
      status=""
      prefill={buildArenaQuickTradePrefill(target.side)}
      onTradeConfirmed={() => {
        closeQuickTrade();
        window.dispatchEvent(new Event("pump:activity"));
      }}
    />
  ) : null;

  return { openQuickTrade, closeQuickTrade, quickTradeSheet };
}
