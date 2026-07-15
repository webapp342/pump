"use client";

import Link from "next/link";
import {
  formatAirdropDisplayStatus,
  type AirdropDisplayStatus,
} from "@/lib/airdrop-status";
import { airdropRewardUsd } from "@/lib/airdrop-board-format";
import { AirdropPoolAmount } from "@/components/airdrops/AirdropPoolAmount";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import {
  airdropCampaignTitle,
  airdropPoolSymbol,
  airdropShowsCountdown,
  airdropTimeCaption,
  airdropValueUsdToneClass,
  type EnrichedAirdrop,
} from "@/lib/airdrops-list-ui";

type AirdropMobileCampaignRowProps = {
  item: EnrichedAirdrop;
  bnbUsd: number | null;
};

/** Compact list tone — text only (no bordered badge) so row height matches logo. */
function statusToneClass(status: AirdropDisplayStatus): string {
  switch (status) {
    case "UPCOMING":
      return "text-pump-accent";
    case "QUALIFYING":
    case "CLAIMABLE":
      return "text-pump-success";
    case "FINALIZING":
      return "text-pump-warning";
    case "CLOSED":
      return "text-pump-muted";
  }
}

export function AirdropMobileCampaignRow({ item, bnbUsd }: AirdropMobileCampaignRowProps) {
  const symbol = airdropPoolSymbol(item);
  const title = airdropCampaignTitle(item);
  const timeCaption = airdropTimeCaption(item);
  const statusLabel = formatAirdropDisplayStatus(item.displayStatus);
  const href = `/airdrops/${item.id}`;
  const usd = airdropRewardUsd(item, bnbUsd);
  const usdLabel = usd != null && Number.isFinite(usd) ? `$${usd.toFixed(2)}` : "—";
  const showCountdown = Boolean(timeCaption && airdropShowsCountdown(item.displayStatus));
  const countdownLabel = timeCaption ?? "—";

  return (
    <Link href={href} className="airdrop-mobile-campaign-row" aria-label={`View ${title}`}>
      <div className="airdrop-mobile-campaign-row__media">
        <TokenAvatar
          address={item.linkedToken}
          symbol={symbol}
          size={52}
          shape="rounded"
          className="airdrop-mobile-campaign-row__avatar !ring-0"
        />
      </div>

      <div className="airdrop-mobile-campaign-row__main min-w-0">
        <div className="airdrop-mobile-campaign-row__head">
          <p className="airdrop-mobile-campaign-row__name truncate">{title}</p>
          <p className="airdrop-mobile-campaign-row__symbol truncate">{symbol}</p>
        </div>
        <div className="airdrop-mobile-campaign-row__stats">
          <AirdropPoolAmount
            totalFunded={item.totalFunded}
            rewardToken={item.rewardToken}
            rewardSymbol={item.rewardSymbol}
            linkedToken={item.linkedToken}
            linkedSymbol={symbol}
            size={12}
            className="airdrop-mobile-campaign-row__stat"
            amountClassName="financial-value tabular-nums text-pump-text"
            symbolClassName="text-pump-muted"
          />
        </div>
      </div>

      <div className="airdrop-mobile-campaign-row__aside">
        <div
          className={`airdrop-mobile-campaign-row__countdown financial-value${
            !timeCaption ? " airdrop-mobile-campaign-row__countdown--empty" : ""
          }`}
        >
          {showCountdown ? <HourglassIcon size={12} aria-hidden /> : null}
          <span>{countdownLabel}</span>
        </div>
        <span
          className={`airdrop-mobile-campaign-row__status ${statusToneClass(item.displayStatus)}`}
        >
          {statusLabel}
        </span>
        <p className="airdrop-mobile-campaign-row__value">
          <span className="airdrop-mobile-campaign-row__value-label">Value</span>
          <span
            className={`airdrop-mobile-campaign-row__value-amount financial-value ${airdropValueUsdToneClass(usd)}`}
          >
            {usdLabel}
          </span>
        </p>
      </div>
    </Link>
  );
}
