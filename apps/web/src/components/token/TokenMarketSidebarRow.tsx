"use client";

import type { TokenListItem } from "@/lib/db/launchpad";
import { FavoriteIcon } from "@/components/icons/FavoriteIcon";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenDetailLink } from "@/components/token/TokenDetailLink";
import { PctChange } from "@/components/ui/PctChange";
import { formatUsdReadable } from "@/lib/format-usd";
import {
  formatCapForBoard,
  formatExplorePriceUsd,
  listTokenPriceUsd,
} from "@/lib/arena-board-format";
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
}: TokenMarketSidebarRowProps) {
  const addressKey = token.address.toLowerCase();
  const isActive = activeTokenAddress?.toLowerCase() === addressKey;
  const resolvedPriceUsd =
    priceUsd ?? listTokenPriceUsd(token.marketCapBnb, bnbUsd);
  const volLabel = formatUsdReadable(vol24hUsd, { compact: true });
  const compact = density === "compact";

  return (
    <TokenDetailLink
      address={token.address}
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
          size={20}
          className="token-market-sidebar__avatar shrink-0 ring-1 ring-pump-border/20"
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

      {!compact ? (
        <div className="token-market-sidebar__cell token-market-sidebar__cell--price token-market-sidebar__col-last">
          <span
            className={`token-market-sidebar__price financial-value ${flashText(priceFlash)}`}
          >
            {formatExplorePriceUsd(resolvedPriceUsd)}
          </span>
          <PctChange
            value={token.change24hPct ?? null}
            className="token-market-sidebar__price-chg"
          />
        </div>
      ) : null}
    </TokenDetailLink>
  );
}
