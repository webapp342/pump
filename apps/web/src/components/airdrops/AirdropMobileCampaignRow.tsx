"use client";

import Link from "next/link";
import {
  airdropStatusBadgeClass,
  formatAirdropDisplayStatus,
} from "@/lib/airdrop-status";
import {
  airdropRewardUsd,
  formatAirdropReward,
} from "@/lib/airdrop-board-format";
import { formatUsdReadable } from "@/lib/format-usd";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import {
  airdropCampaignTitle,
  airdropPoolSymbol,
  airdropShowsCountdown,
  airdropTimeCaption,
  type EnrichedAirdrop,
} from "@/lib/airdrops-list-ui";
import { AirdropSaveButton } from "@/components/airdrops/AirdropSaveButton";

type AirdropMobileCampaignRowProps = {
  item: EnrichedAirdrop;
  bnbUsd: number | null;
};

export function AirdropMobileCampaignRow({ item, bnbUsd }: AirdropMobileCampaignRowProps) {
  const symbol = airdropPoolSymbol(item);
  const title = airdropCampaignTitle(item);
  const timeCaption = airdropTimeCaption(item);
  const href = `/airdrops/${item.id}`;
  const isBnb = !item.rewardToken;
  const poolLabel = formatAirdropReward(item.totalFunded, {
    isBnb,
    symbol: item.rewardSymbol,
  });
  const usd = airdropRewardUsd(item, bnbUsd);
  const usdLabel = usd != null ? formatUsdReadable(usd, { compact: true }) : "—";

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
          <div className="airdrop-mobile-campaign-row__meta-line">
            <span className="airdrop-mobile-campaign-row__symbol">{symbol}</span>
            <span
              className={`airdrop-mobile-campaign-row__status ${airdropStatusBadgeClass(item.displayStatus)}`}
            >
              {formatAirdropDisplayStatus(item.displayStatus)}
            </span>
            <AirdropSaveButton airdropId={item.id} className="airdrop-mobile-campaign-row__save" />
          </div>
        </div>
        <p className="airdrop-mobile-campaign-row__pool financial-value">{poolLabel}</p>
      </div>

      <div className="airdrop-mobile-campaign-row__aside">
        <div className="airdrop-mobile-campaign-row__quote">
          <div className="airdrop-mobile-campaign-row__metric">
            <span className="airdrop-mobile-campaign-row__metric-label">Pool</span>
            <span className="airdrop-mobile-campaign-row__metric-value financial-value">
              {usdLabel}
            </span>
          </div>
        </div>
        {timeCaption ? (
          <div className="airdrop-mobile-campaign-row__time financial-value">
            {airdropShowsCountdown(item.displayStatus) ? (
              <HourglassIcon size={11} aria-hidden />
            ) : null}
            <span>{timeCaption}</span>
          </div>
        ) : (
          <div className="airdrop-mobile-campaign-row__time airdrop-mobile-campaign-row__time--empty">
            —
          </div>
        )}
      </div>
    </Link>
  );
}
