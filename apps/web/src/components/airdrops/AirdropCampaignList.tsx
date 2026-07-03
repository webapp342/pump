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
import { PumpIcon, faBookmarkRegular, faBookmarkSolid } from "@/lib/icons";
import { useAirdropSaves } from "@/components/airdrops/AirdropSavesProvider";
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

function AirdropSaveButton({ airdropId }: { airdropId: string }) {
  const { isSaved, toggleSave } = useAirdropSaves();
  const saved = isSaved(airdropId);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSave(airdropId);
      }}
      className={`airdrops-list__save inline-flex h-7 w-7 shrink-0 items-center justify-center transition ${
        saved ? "text-pump-accent" : "text-pump-muted hover:text-pump-text"
      }`}
      aria-label={saved ? "Remove from saved" : "Save campaign"}
    >
      <PumpIcon icon={saved ? faBookmarkSolid : faBookmarkRegular} className="h-3.5 w-3.5" />
    </button>
  );
}

function RewardLabel({
  item,
  bnbUsd,
}: {
  item: EnrichedAirdrop;
  bnbUsd: number | null;
}) {
  const isBnb = !item.rewardToken;
  const amountLabel = formatAirdropReward(item.totalFunded, {
    isBnb,
    symbol: item.rewardSymbol,
  });
  const usd = airdropRewardUsd(item, bnbUsd);

  return (
    <span className="airdrops-list__reward financial-value">
      <span className="airdrops-list__reward-token">{amountLabel}</span>
      {usd != null ? (
        <span className="airdrops-list__reward-usd">{formatUsdReadable(usd, { compact: true })}</span>
      ) : null}
    </span>
  );
}

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

  return (
    <Link href={href} className="airdrops-list__row">
      <div className="airdrops-list__cell airdrops-list__cell--save">
        <AirdropSaveButton airdropId={item.id} />
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--campaign">
        <TokenAvatar address={item.linkedToken} symbol={symbol} size={24} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="airdrops-list__title truncate">{title}</p>
          <p className="airdrops-list__symbol truncate">{symbol}</p>
        </div>
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--reward">
        <RewardLabel item={item} bnbUsd={bnbUsd} />
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--status">
        <span className={`airdrops-list__status ${airdropStatusBadgeClass(item.displayStatus)}`}>
          {formatAirdropDisplayStatus(item.displayStatus)}
        </span>
      </div>

      <div className="airdrops-list__cell airdrops-list__cell--time">
        {timeCaption ? (
          <span className="airdrops-list__time financial-value">
            {airdropShowsCountdown(item.displayStatus) ? (
              <HourglassIcon size={11} aria-hidden />
            ) : null}
            {timeCaption}
          </span>
        ) : (
          <span className="airdrops-list__dash">—</span>
        )}
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
}: {
  label: string;
  sortKey: AirdropSortKey;
  activeKey: AirdropSortKey;
  sortDir: AirdropSortDir;
  onSort: (key: AirdropSortKey) => void;
  alignRight?: boolean;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`airdrops-list__sort${active ? " airdrops-list__sort--active" : ""}${
        alignRight ? " airdrops-list__sort--right" : ""
      }`}
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
    <section className="airdrops-list">
      <div className="airdrops-list__head">
        <span className="airdrops-list__head-save" aria-hidden />
        <span>Campaign</span>
        <SortButton
          label="Pool"
          sortKey="reward"
          activeKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          alignRight
        />
        <SortButton
          label="Status"
          sortKey="status"
          activeKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
        />
        <SortButton
          label="Ends"
          sortKey="end"
          activeKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          alignRight
        />
      </div>
      <div className="airdrops-list__body">
        {items.map((item) => (
          <AirdropCampaignRow key={item.id} item={item} bnbUsd={bnbUsd} />
        ))}
      </div>
    </section>
  );
}
