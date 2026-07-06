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
import { AirdropMobileCampaignRow } from "@/components/airdrops/AirdropMobileCampaignRow";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { HourglassIcon } from "@/components/ui/HourglassIcon";
import {
  airdropCampaignTitle,
  airdropPoolSymbol,
  airdropShowsCountdown,
  airdropTimeCaption,
  type AirdropSortDir,
  type AirdropSortKey,
  type EnrichedAirdrop,
} from "@/lib/airdrops-list-ui";

function AirdropCampaignRow({
  item,
  bnbUsd,
}: {
  item: EnrichedAirdrop;
  bnbUsd: number | null;
}) {
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
  const usdLabel = usd != null ? formatUsdReadable(usd, { compact: true }) : null;
  const statusLabel = formatAirdropDisplayStatus(item.displayStatus);
  const footLabel = timeCaption ?? statusLabel;
  const showCountdown = Boolean(timeCaption && airdropShowsCountdown(item.displayStatus));

  return (
    <Link href={href} className="airdrops-list__row">
      <div className="airdrops-list__cell airdrops-list__cell--campaign">
        <TokenAvatar address={item.linkedToken} symbol={symbol} size={24} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="airdrops-list__title airdrops-list__title--desktop truncate" title={title}>
            {title}
          </p>
          <p className="airdrops-list__symbol truncate">{symbol}</p>
        </div>
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--pool financial-value">
        <span className="airdrops-list__pool-token">{poolLabel}</span>
        {usdLabel ? <span className="airdrops-list__pool-usd">{usdLabel}</span> : null}
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--value financial-value">
        {usdLabel ? <span className="airdrops-list__value-usd">{usdLabel}</span> : <span className="airdrops-list__dash">—</span>}
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--status">
        <span className={`airdrops-list__status ${airdropStatusBadgeClass(item.displayStatus)}`}>
          {formatAirdropDisplayStatus(item.displayStatus)}
        </span>
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--time">
        <span className="airdrops-list__time financial-value">
          {showCountdown ? <HourglassIcon size={11} aria-hidden /> : null}
          {footLabel}
        </span>
      </div>
    </Link>
  );
}

function SortButton({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  alignRight = false,
  className = "",
}: {
  label: string;
  sortKey: AirdropSortKey;
  activeKey: AirdropSortKey;
  sortDir: AirdropSortDir;
  onSort: (key: AirdropSortKey) => void;
  alignRight?: boolean;
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`airdrops-list__sort${active ? " airdrops-list__sort--active" : ""}${
        alignRight ? " airdrops-list__sort--right" : ""
      } ${className}`.trim()}
    >
      {label}
      {active ? (sortDir === "asc" ? " ↑" : " ↓") : null}
    </button>
  );
}

type AirdropCampaignListProps = {
  items: EnrichedAirdrop[];
  bnbUsd: number | null;
  sortKey: AirdropSortKey;
  sortDir: AirdropSortDir;
  onSort: (key: AirdropSortKey) => void;
};

export function AirdropCampaignList({
  items,
  bnbUsd,
  sortKey,
  sortDir,
  onSort,
}: AirdropCampaignListProps) {
  return (
    <>
      <div className="airdrops-mobile-list airdrops-mobile-list--mobile md:hidden" aria-label="Airdrop campaigns">
        {items.map((item) => (
          <AirdropMobileCampaignRow key={item.id} item={item} bnbUsd={bnbUsd} />
        ))}
      </div>

      <section className="airdrops-list airdrops-list--desktop hidden md:flex" aria-label="Airdrop campaigns">
        <div className="airdrops-list__head">
          <span className="airdrops-list__head-cell airdrops-list__head-cell--campaign">Campaign</span>
          <SortButton
            label="Pool"
            sortKey="reward"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            className="airdrops-list__head-cell airdrops-list__head-cell--pool"
          />
          <span className="airdrops-list__head-value airdrops-list__head-cell airdrops-list__head-cell--value">
            Value
          </span>
          <SortButton
            label="Status"
            sortKey="status"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            className="airdrops-list__head-cell airdrops-list__head-cell--status"
          />
          <SortButton
            label="Ends"
            sortKey="end"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            alignRight
            className="airdrops-list__head-cell airdrops-list__head-cell--time"
          />
        </div>
        <div className="airdrops-list__scroll">
          <div className="airdrops-list__body">
            {items.map((item) => (
              <AirdropCampaignRow key={item.id} item={item} bnbUsd={bnbUsd} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
