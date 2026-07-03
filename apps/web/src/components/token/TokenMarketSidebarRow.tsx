"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TokenListItem } from "@/lib/db/launchpad";
import { ArenaBoardRowQuickActions } from "@/components/arena/ArenaBoardRowQuickActions";
import { FavoriteIcon } from "@/components/icons/FavoriteIcon";
import { HoldingSwipeRow } from "@/components/portfolio/HoldingSwipeRow";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenDetailLink } from "@/components/token/TokenDetailLink";
import { seedTokenDetailFromListItem } from "@/lib/token-detail-client";
import { PctChange } from "@/components/ui/PctChange";
import { UsdReadablePrice } from "@/components/ui/UsdReadablePrice";
import { formatUsdReadable } from "@/lib/format-usd";
import {
  formatCapForBoard,
  listTokenPriceUsd,
} from "@/lib/arena-board-format";
import {
  ARENA_QUICK_TRADE_CHANGE_EVENT,
  buildArenaQuickTradeHref,
  quickTradeSwipeLabels,
} from "@/lib/arena-quick-trade";
import { flashText, type FlashTone } from "@/lib/arena-explore-board-core";

import type { TokenSidebarDensity } from "@/hooks/useTokenSidebarWidth";

type TokenMarketSidebarRowProps = {
  token: TokenListItem;
  activeTokenAddress?: string;
  density?: TokenSidebarDensity;
  mcapUsd: number | null;
  priceUsd: number | null;
  vol24hUsd: number | null;
  bnbUsd: number | null;
  mcapFlash?: FlashTone;
  priceFlash?: FlashTone;
  volFlash?: FlashTone;
  rowClass?: string;
  isFavorite: boolean;
  onToggleFavorite: (address: string) => void;
  onTokenSelect?: () => void;
  /** Desktop sidebar — hover swaps data cell for Buy/Sell (MCAP compact / Last Price full). */
  showRowQuickActions?: boolean;
  /** Mobile sheet — swipe left/right for flash trade (portfolio pattern). */
  enableSwipeTrade?: boolean;
  peekSwipeOnMount?: boolean;
};

export function TokenMarketSidebarRow({
  token,
  activeTokenAddress,
  density = "full",
  mcapUsd,
  priceUsd,
  vol24hUsd,
  bnbUsd,
  mcapFlash,
  priceFlash,
  volFlash,
  rowClass = "",
  isFavorite,
  onToggleFavorite,
  onTokenSelect,
  showRowQuickActions = false,
  enableSwipeTrade = false,
  peekSwipeOnMount = false,
}: TokenMarketSidebarRowProps) {
  const router = useRouter();
  const [swipeLabels, setSwipeLabels] = useState(quickTradeSwipeLabels);
  const addressKey = token.address.toLowerCase();
  const isActive = activeTokenAddress?.toLowerCase() === addressKey;
  const resolvedPriceUsd =
    priceUsd ?? listTokenPriceUsd(token.marketCapBnb, bnbUsd);
  const volLabel = formatUsdReadable(vol24hUsd, { compact: true });
  const compact = density === "compact";

  const syncSwipeLabels = useCallback(() => {
    setSwipeLabels(quickTradeSwipeLabels());
  }, []);

  useEffect(() => {
    if (!enableSwipeTrade) return;
    syncSwipeLabels();
    const onChange = () => syncSwipeLabels();
    window.addEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(ARENA_QUICK_TRADE_CHANGE_EVENT, onChange);
  }, [enableSwipeTrade, syncSwipeLabels]);

  const runQuickTrade = (side: "buy" | "sell") => {
    router.push(buildArenaQuickTradeHref(token.address, side));
    onTokenSelect?.();
  };

  const quickBuy = () => runQuickTrade("buy");
  const quickSell = () => runQuickTrade("sell");
  const quickActions = showRowQuickActions ? (
    <ArenaBoardRowQuickActions layout="card-compact" onBuy={quickBuy} onSell={quickSell} />
  ) : null;

  const rowLink = (
    <TokenDetailLink
      address={token.address}
      onClick={() => {
        seedTokenDetailFromListItem(token);
        onTokenSelect?.();
      }}
      className={`token-market-sidebar__row ${rowClass} ${
        isActive ? "token-market-sidebar__row--active" : ""
      }`}
      aria-label={`View ${token.symbol}`}
      aria-current={isActive ? "page" : undefined}
    >
      <div className="token-market-sidebar__cell token-market-sidebar__cell--name">
        <button
          type="button"
          className="token-market-sidebar__fav"
          aria-label={isFavorite ? `Remove ${token.symbol} from favorites` : `Add ${token.symbol} to favorites`}
          aria-pressed={isFavorite}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite(token.address);
          }}
        >
          <FavoriteIcon active={isFavorite} className="h-3 w-3" />
        </button>
        <TokenAvatar
          address={token.address}
          symbol={token.symbol}
          logoUrl={token.logoUrl}
          shape="rounded"
          size={40}
          className="token-market-sidebar__avatar shrink-0"
        />
        <div className="token-market-sidebar__name-copy min-w-0">
          <p className="token-market-sidebar__pair-line">{token.symbol}/USD</p>
          <p
            className={`token-market-sidebar__vol-line financial-value ${flashText(volFlash)}`}
          >
            {volLabel}
          </p>
        </div>
      </div>

      <div className="token-market-sidebar__cell token-market-sidebar__cell--mcap token-market-sidebar__col-mcap">
        <div className="token-market-sidebar__mcap-stack">
          <span className={`token-market-sidebar__mcap financial-value ${flashText(mcapFlash)}`}>
            {formatCapForBoard(mcapUsd)}
          </span>
          {compact ? (
            <PctChange
              value={token.change24hPct ?? null}
              className="token-market-sidebar__mcap-chg"
            />
          ) : null}
        </div>
        {showRowQuickActions && compact ? (
          <div className="token-market-sidebar__mcap-actions">{quickActions}</div>
        ) : null}
      </div>

      {!compact ? (
        <div className="token-market-sidebar__cell token-market-sidebar__cell--price token-market-sidebar__col-last">
          <div className="token-market-sidebar__price-stack">
            <span
              className={`token-market-sidebar__price financial-value ${flashText(priceFlash)}`}
            >
              <UsdReadablePrice value={resolvedPriceUsd} compact />
            </span>
            <PctChange
              value={token.change24hPct ?? null}
              className="token-market-sidebar__price-chg"
            />
          </div>
          {showRowQuickActions ? (
            <div className="token-market-sidebar__price-actions">{quickActions}</div>
          ) : null}
        </div>
      ) : null}
    </TokenDetailLink>
  );

  if (!enableSwipeTrade) {
    return rowLink;
  }

  return (
    <HoldingSwipeRow
      onBuyMax={quickBuy}
      onSellMax={quickSell}
      buyLabel={swipeLabels.buyLabel}
      sellLabel={swipeLabels.sellLabel}
      peekOnMount={peekSwipeOnMount}
      rowClassName="token-market-sidebar__swipe-row"
      contentClassName="token-market-sidebar__row-surface"
    >
      {rowLink}
    </HoldingSwipeRow>
  );
}
