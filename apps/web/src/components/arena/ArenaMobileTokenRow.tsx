"use client";

import type { TokenListItem } from "@/lib/db/launchpad";
import { ArenaBoardTokenRow } from "@/components/arena/ArenaBoardTokenRow";
import { HoldingSwipeRow } from "@/components/portfolio/HoldingSwipeRow";
import { TokenDetailLink } from "@/components/token/TokenDetailLink";
import { quickTradeSwipeLabels } from "@/lib/arena-quick-trade";
import type { FlashTone } from "@/lib/arena-explore-board-core";

type ArenaMobileTokenRowProps = {
  token: TokenListItem;
  mcapUsd: number | null;
  vol24hUsd: number | null;
  mcapFlash?: FlashTone;
  onQuickTrade: (side: "buy" | "sell") => void;
};

export function ArenaMobileTokenRow({
  token,
  mcapUsd,
  vol24hUsd,
  mcapFlash,
  onQuickTrade,
}: ArenaMobileTokenRowProps) {
  const swipeLabels = quickTradeSwipeLabels();

  return (
    <HoldingSwipeRow
      onBuyMax={() => onQuickTrade("buy")}
      onSellMax={() => onQuickTrade("sell")}
      buyLabel={swipeLabels.buyLabel}
      sellLabel={swipeLabels.sellLabel}
      rowClassName="arena-mobile-token-row__swipe"
      contentClassName="arena-mobile-token-row__surface"
    >
      <TokenDetailLink
        address={token.address}
        className="arena-mobile-token-row"
        aria-label={`View ${token.symbol}`}
      >
        <ArenaBoardTokenRow
          token={token}
          mcapUsd={mcapUsd}
          vol24hUsd={vol24hUsd}
          mcapFlash={mcapFlash}
        />
      </TokenDetailLink>
    </HoldingSwipeRow>
  );
}
