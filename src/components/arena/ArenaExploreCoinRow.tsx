"use client";

import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenDetailLink } from "@/components/token/TokenDetailLink";
import { PctChange } from "@/components/ui/PctChange";
import {
  formatExploreMcapLabel,
  formatExplorePriceUsd,
  listTokenPriceUsd,
} from "@/lib/arena-board-format";

type FlashTone = "up" | "down";

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

type ArenaExploreCoinRowProps = {
  token: TokenListItem;
  mcapUsd: number | null;
  priceUsd: number | null;
  bnbUsd: number | null;
  mcapFlash?: FlashTone;
  priceFlash?: FlashTone;
  change24hPct: number | null;
};

export function ArenaExploreCoinRow({
  token,
  mcapUsd,
  priceUsd,
  bnbUsd,
  mcapFlash,
  priceFlash,
  change24hPct,
}: ArenaExploreCoinRowProps) {
  const change = change24hPct ?? token.change24hPct ?? null;
  const resolvedPriceUsd =
    priceUsd ?? listTokenPriceUsd(token.marketCapBnb, bnbUsd);

  return (
    <TokenDetailLink
      address={token.address}
      className="arena-explore-row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 text-inherit no-underline"
      aria-label={`View ${token.symbol}`}
    >
      <TokenAvatar
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
        size={40}
        className="ring-1 ring-pump-border/25"
      />
      <div className="min-w-0">
        <p className="truncate text-body font-semibold leading-tight text-pump-text">{token.symbol}</p>
        <p
          className={`financial-value mt-0.5 truncate text-caption leading-tight text-pump-muted ${flashText(mcapFlash)}`}
        >
          {formatExploreMcapLabel(mcapUsd)}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`financial-value text-body-sm font-medium leading-tight text-pump-text ${flashText(priceFlash)}`}
        >
          {formatExplorePriceUsd(resolvedPriceUsd)}
        </p>
        <PctChange value={change} className="mt-0.5 text-caption leading-tight" />
      </div>
    </TokenDetailLink>
  );
}
