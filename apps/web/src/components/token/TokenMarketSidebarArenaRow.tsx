"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { TokenListItem } from "@/lib/db/launchpad";
import { ArenaBoardRowQuickActions } from "@/components/arena/ArenaBoardRowQuickActions";
import { ArenaBoardTokenRow } from "@/components/arena/ArenaBoardTokenRow";
import {
  fetchTokenDetailBundleClient,
  seedTokenDetailFromListItem,
  tokenDetailQueryKey,
} from "@/lib/token-detail-client";
import { tokenDetailPath } from "@/lib/token-routes";
import { formatArenaQuoteUsd } from "@/lib/arena-board-format";
import { flashText, type FlashTone } from "@/lib/arena-explore-board-core";

type TokenMarketSidebarArenaRowProps = {
  token: TokenListItem;
  activeTokenAddress?: string;
  mcapUsd: number | null;
  vol24hUsd: number | null;
  mcapFlash?: FlashTone;
  rowClass?: string;
  onTokenSelect?: () => void;
  onQuickTrade?: (side: "buy" | "sell") => void;
  showRowQuickActions?: boolean;
};

function mcapValueTone(mcapUsd: number | null): "low" | "mid" | "high" {
  if (mcapUsd == null || !Number.isFinite(mcapUsd) || mcapUsd < 10_000) return "low";
  if (mcapUsd <= 20_000) return "mid";
  return "high";
}

function mcapToneClass(tone: "low" | "mid" | "high"): string {
  return `arena-mobile-token-row__mcap-tone--${tone}`;
}

export function TokenMarketSidebarArenaRow({
  token,
  activeTokenAddress,
  mcapUsd,
  vol24hUsd,
  mcapFlash,
  rowClass = "",
  onTokenSelect,
  onQuickTrade,
  showRowQuickActions = false,
}: TokenMarketSidebarArenaRowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const suppressNavUntilRef = useRef(0);
  const addressKey = token.address.toLowerCase();
  const isActive = activeTokenAddress?.toLowerCase() === addressKey;
  const tokenHref = tokenDetailPath(token.address);

  const prefetchBundle = useCallback(() => {
    router.prefetch(tokenHref);
    void queryClient.prefetchQuery({
      queryKey: tokenDetailQueryKey(token.address),
      queryFn: () => fetchTokenDetailBundleClient(token.address),
      staleTime: 5_000,
    });
  }, [queryClient, router, token.address, tokenHref]);

  const navigateToDetail = useCallback(() => {
    if (Date.now() < suppressNavUntilRef.current) return;
    seedTokenDetailFromListItem(token);
    onTokenSelect?.();
    router.push(tokenHref);
  }, [onTokenSelect, router, token, tokenHref]);

  const runQuickTrade = (side: "buy" | "sell") => {
    suppressNavUntilRef.current = Date.now() + 500;
    onQuickTrade?.(side);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if ((event.target as HTMLElement).closest("button, a")) return;
    event.preventDefault();
    navigateToDetail();
  };

  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    navigateToDetail();
  };

  const quickActions = showRowQuickActions ? (
    <div
      className="token-market-sidebar__arena-aside-overlay"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="arena-mobile-token-row__metric token-market-sidebar__arena-hover-mcap">
        <span className="arena-mobile-token-row__metric-label">MC</span>
        <span
          className={`arena-mobile-token-row__metric-value arena-mobile-token-row__metric-value--mc financial-value ${mcapToneClass(mcapValueTone(mcapUsd))} ${flashText(mcapFlash)}`}
        >
          {formatArenaQuoteUsd(mcapUsd)}
        </span>
      </div>
      <div className="token-market-sidebar__arena-aside-actions">
        <ArenaBoardRowQuickActions
          layout="card-compact"
          onBuy={() => runQuickTrade("buy")}
          onSell={() => runQuickTrade("sell")}
        />
      </div>
    </div>
  ) : null;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      onMouseEnter={prefetchBundle}
      onFocus={prefetchBundle}
      className={`arena-mobile-token-row token-market-sidebar__arena-row ${rowClass} ${
        isActive ? "token-market-sidebar__arena-row--active" : ""
      }${showRowQuickActions ? " token-market-sidebar__arena-row--quick-trade" : ""}`}
      aria-label={`View ${token.symbol}`}
      aria-current={isActive ? "page" : undefined}
    >
      <ArenaBoardTokenRow
        token={token}
        mcapUsd={mcapUsd}
        vol24hUsd={vol24hUsd}
        mcapFlash={mcapFlash}
        asideActions={quickActions}
      />
    </div>
  );
}
