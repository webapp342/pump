import type { ArenaFilterCounts, KothSummary, TokenListItem } from "@/lib/db/launchpad";
import type { BoardFilter } from "@/lib/arena-filters";
import type { ArenaBoardSortDir, ArenaBoardSortKey } from "@/lib/db/launchpad";

export type ArenaBoardQueryParams = {
  limit: number;
  sortKey: ArenaBoardSortKey;
  sortDir: ArenaBoardSortDir;
  filter: BoardFilter;
  airdropAddresses?: string[];
};

export type ArenaBoardResponse = {
  data: TokenListItem[];
  topByMcap: TokenListItem[];
  koth: KothSummary | null;
  meta: {
    total: number;
    limit: number;
    hasMore: boolean;
    filterCounts: ArenaFilterCounts;
  };
  bnbUsd: number | null;
};

export function arenaBoardQueryKey(params: ArenaBoardQueryParams): readonly unknown[] {
  const airdropKey =
    params.filter === "hasAirdrop" && params.airdropAddresses?.length
      ? [...params.airdropAddresses].sort().join("|")
      : "";
  return [
    "arena-board",
    params.filter,
    params.sortKey,
    params.sortDir,
    params.limit,
    airdropKey,
  ] as const;
}

export function buildArenaBoardUrl(params: ArenaBoardQueryParams): string {
  const search = new URLSearchParams({
    limit: String(params.limit),
    sortKey: params.sortKey,
    sortDir: params.sortDir,
    filter: params.filter === "favorites" ? "all" : params.filter,
  });
  if (params.filter === "hasAirdrop" && params.airdropAddresses?.length) {
    search.set("airdrop", params.airdropAddresses.join(","));
  }
  return `/api/tokens?${search.toString()}`;
}

export async function fetchArenaBoard(
  params: ArenaBoardQueryParams
): Promise<ArenaBoardResponse> {
  const response = await fetch(buildArenaBoardUrl(params), { cache: "no-store" });
  const body = (await response.json()) as ArenaBoardResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to load arena board");
  }
  return {
    data: body.data ?? [],
    topByMcap: body.topByMcap ?? [],
    koth: body.koth ?? null,
    meta: body.meta ?? {
      total: 0,
      limit: params.limit,
      hasMore: false,
      filterCounts: { all: 0, new: 0, movers: 0, kothContenders: 0, hasAirdrop: 0 },
    },
    bnbUsd: body.bnbUsd ?? null,
  };
}
