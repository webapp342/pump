import { shortAddress } from "@/config/chain";
import type { AirdropListItem } from "@/lib/db/airdrops";
import {
  getAirdropDisplayStatus,
  type AirdropDisplayStatus,
} from "@/lib/airdrop-status";
import {
  airdropRewardUsd,
  formatDurationUntil,
  formatTimeRemaining,
  isEndingSoon,
} from "@/lib/airdrop-board-format";

export type AirdropFilter =
  | "all"
  | "qualifying"
  | "claimable"
  | "upcoming"
  | "ended"
  | "saved"
  | "mine";

export type AirdropSortKey = "reward" | "end" | "start" | "status";
export type AirdropSortDir = "asc" | "desc";

export type EnrichedAirdrop = AirdropListItem & {
  displayStatus: AirdropDisplayStatus;
  rewardNum: number;
  rewardUsd: number;
};

export const ENDING_SOON_HOURS = 48;

export function rewardUsdValue(
  item: Pick<AirdropListItem, "totalFunded" | "rewardToken" | "rewardPriceBnb">,
  bnbUsd: number | null | undefined
): number {
  const usd = airdropRewardUsd(item, bnbUsd);
  if (usd != null) return usd;
  return Number(item.totalFunded) || 0;
}

export function enrichAirdropItem(
  item: AirdropListItem,
  bnbUsd: number | null
): EnrichedAirdrop {
  return {
    ...item,
    displayStatus: getAirdropDisplayStatus({
      status: item.status,
      qualifyStart: item.qualifyStart,
      qualifyEnd: item.qualifyEnd,
      claimEnd: item.claimEnd,
      merkleRoot: item.status === "FINALIZED" ? "0x1" : null,
    }),
    rewardNum: Number(item.totalFunded) || 0,
    rewardUsd: rewardUsdValue(item, bnbUsd),
  };
}

export function airdropCampaignTitle(item: AirdropListItem): string {
  return item.title ?? item.linkedName ?? item.linkedSymbol ?? shortAddress(item.linkedToken);
}

export function airdropPoolSymbol(item: AirdropListItem): string {
  return item.linkedSymbol ?? shortAddress(item.linkedToken);
}

export function matchesAirdropFilter(
  item: EnrichedAirdrop,
  filter: AirdropFilter,
  savedIds: Set<string>,
  mineIds: Set<string>
): boolean {
  if (filter === "saved") return savedIds.has(item.id);
  if (filter === "mine") return mineIds.has(item.id);
  if (filter === "qualifying") return item.displayStatus === "QUALIFYING";
  if (filter === "claimable") return item.displayStatus === "CLAIMABLE";
  if (filter === "upcoming") return item.displayStatus === "UPCOMING";
  if (filter === "ended") return item.displayStatus === "CLOSED";
  return true;
}

export function airdropStatusSortWeight(status: AirdropDisplayStatus): number {
  switch (status) {
    case "QUALIFYING":
      return 4;
    case "CLAIMABLE":
      return 3;
    case "UPCOMING":
      return 2;
    case "FINALIZING":
      return 1;
    default:
      return 0;
  }
}

export function airdropShowsCountdown(status: AirdropDisplayStatus): boolean {
  return status === "UPCOMING" || status === "QUALIFYING" || status === "CLAIMABLE";
}

export function airdropTimeCaption(item: EnrichedAirdrop): string | null {
  switch (item.displayStatus) {
    case "UPCOMING":
      return formatDurationUntil(item.qualifyStart);
    case "QUALIFYING":
      return formatTimeRemaining(item.qualifyEnd);
    case "CLAIMABLE":
      return item.claimEnd ? formatTimeRemaining(item.claimEnd) : "Window open";
    case "FINALIZING":
      return "Finalizing winners";
    case "CLOSED":
      return null;
  }
}

export function pickFeaturedAirdrop(items: EnrichedAirdrop[]): EnrichedAirdrop | null {
  if (!items.length) return null;

  const byPriority = (list: EnrichedAirdrop[]) =>
    [...list].sort((a, b) => b.rewardUsd - a.rewardUsd)[0] ?? null;

  const qualifying = items.filter((i) => i.displayStatus === "QUALIFYING");
  if (qualifying.length) return byPriority(qualifying);

  const claimable = items.filter((i) => i.displayStatus === "CLAIMABLE");
  if (claimable.length) return byPriority(claimable);

  const upcoming = items.filter((i) => i.displayStatus === "UPCOMING");
  if (upcoming.length) return byPriority(upcoming);

  return byPriority(items);
}

export function isAirdropEndingSoon(item: EnrichedAirdrop): boolean {
  return (
    item.displayStatus === "QUALIFYING" &&
    isEndingSoon(item.qualifyEnd, ENDING_SOON_HOURS)
  );
}
