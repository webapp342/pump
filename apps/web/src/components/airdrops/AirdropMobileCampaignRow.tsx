"use client";

import Link from "next/link";
import { formatAirdropDisplayStatus } from "@/lib/airdrop-status";
import {
  airdropRewardUsd,
  formatAirdropReward,
} from "@/lib/airdrop-board-format";
import { formatUsdReadable } from "@/lib/format-usd";
import { PumpIcon, faParachuteBox } from "@/lib/icons";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import {
  airdropCampaignTitle,
  airdropPoolSymbol,
  airdropShowsCountdown,
  airdropTimeCaption,
  type EnrichedAirdrop,
} from "@/lib/airdrops-list-ui";
import type { AirdropDisplayStatus } from "@/lib/airdrop-status";

type AirdropMobileCampaignRowProps = {
  item: EnrichedAirdrop;
  bnbUsd: number | null;
};

function statusToneClass(status: AirdropDisplayStatus): string {
  if (status === "QUALIFYING" || status === "CLAIMABLE") {
    return "airdrop-mobile-campaign-row__tone--success";
  }
  if (status === "UPCOMING") {
    return "airdrop-mobile-campaign-row__tone--neutral";
  }
  return "airdrop-mobile-campaign-row__tone--muted";
}

export function AirdropMobileCampaignRow({ item, bnbUsd }: AirdropMobileCampaignRowProps) {
  const symbol = airdropPoolSymbol(item);
  const title = airdropCampaignTitle(item);
  const timeCaption = airdropTimeCaption(item);
  const statusLabel = formatAirdropDisplayStatus(item.displayStatus);
  const href = `/airdrops/${item.id}`;
  const isBnb = !item.rewardToken;
  const poolLabel = formatAirdropReward(item.totalFunded, {
    isBnb,
    symbol: item.rewardSymbol,
  });
  const usd = airdropRewardUsd(item, bnbUsd);
  const usdLabel = usd != null ? formatUsdReadable(usd, { compact: true }) : "—";
  const footLabel = timeCaption ?? statusLabel;
  const showCountdown = Boolean(timeCaption && airdropShowsCountdown(item.displayStatus));

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
            {timeCaption ? (
              <span
                className={`airdrop-mobile-campaign-row__status financial-value ${statusToneClass(item.displayStatus)}`}
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="airdrop-mobile-campaign-row__stats">
          <span className="airdrop-mobile-campaign-row__stat">
            <PumpIcon icon={faParachuteBox} className="airdrop-mobile-campaign-row__stat-icon" aria-hidden />
            <span className="financial-value">{poolLabel}</span>
          </span>
        </div>
      </div>

      <div className="airdrop-mobile-campaign-row__aside">
        <div className="airdrop-mobile-campaign-row__quote">
          <div className="airdrop-mobile-campaign-row__metric">
            <span className="airdrop-mobile-campaign-row__metric-label">Pool</span>
            <span className="airdrop-mobile-campaign-row__metric-value airdrop-mobile-campaign-row__metric-value--pool financial-value">
              {usdLabel}
            </span>
          </div>
        </div>
        {footLabel ? (
          <div
            className={`airdrop-mobile-campaign-row__ends financial-value${
              !timeCaption ? ` ${statusToneClass(item.displayStatus)}` : ""
            }`}
          >
            {showCountdown ? <HourglassIcon size={11} aria-hidden /> : null}
            <span>{footLabel}</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
