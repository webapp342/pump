import { cacheLife, cacheTag } from "next/cache";
import { fetchBnbUsdPrice } from "@/lib/bnb-price-server";
import { useRedisArenaCache } from "@/lib/db/perf-flags";
import {
  readArenaHomeCache,
  writeArenaHomeCache,
  writeTopMcapCache,
} from "@/lib/redis/arena-cache";
import {
  getArenaFilterCounts,
  getKothSummary,
  hydrateTokenBoardList,
  listArenaBoardTokens,
  listTopTokensByMcap,
  type ArenaBoardFilter,
  type ArenaBoardSortDir,
  type ArenaBoardSortKey,
  type ArenaFilterCounts,
  type ArenaListMeta,
  type KothSummary,
  type TokenListItem,
} from "@/lib/db/launchpad";
import { RECENT_STRIP_DESKTOP } from "@/lib/recent-strip-limits";
import { sortTokensByMcap } from "@/lib/arena-board-merge";

export const ARENA_HOME_LIMIT = 50;
const TOP_MCAP_LIMIT = 20;

export type ArenaHomePayload = {
  data: TokenListItem[];
  topByMcap: TokenListItem[];
  koth: KothSummary | null;
  meta: ArenaListMeta;
  bnbUsd: number | null;
};

function filterCountKey(
  filter: ArenaBoardFilter
): keyof ArenaFilterCounts {
  if (filter === "movers") return "movers";
  if (filter === "kothContenders") return "kothContenders";
  if (filter === "hasAirdrop") return "hasAirdrop";
  if (filter === "new") return "new";
  return "all";
}

export type ArenaHomeFetchOptions = {
  limit?: number;
  sortKey?: ArenaBoardSortKey;
  sortDir?: ArenaBoardSortDir;
  filter?: ArenaBoardFilter;
  airdropAddresses?: string[];
};

function arenaCacheTag(options: ArenaHomeFetchOptions): string {
  const filter = options.filter ?? "new";
  const sortKey = options.sortKey ?? "age";
  const sortDir = options.sortDir ?? "desc";
  const airdropKey =
    options.airdropAddresses && options.airdropAddresses.length > 0
      ? [...options.airdropAddresses].sort().join(",")
      : "";
  return `arena:${filter}:${sortKey}:${sortDir}:${options.limit ?? ARENA_HOME_LIMIT}:${airdropKey}`;
}

/**
 * Fresh arena board from PostgreSQL — same SQL path as portfolio launched tokens.
 * API routes and live client refetches must use this (no Next/Redis cache).
 */
export async function loadArenaHomePayloadFromDb(
  options: ArenaHomeFetchOptions = {}
): Promise<ArenaHomePayload> {
  const limit = options.limit ?? ARENA_HOME_LIMIT;
  const sortKey = options.sortKey ?? "age";
  const sortDir = options.sortDir ?? "desc";
  const filter = options.filter ?? "new";
  const airdropAddresses = options.airdropAddresses ?? [];

  const [rawBoard, rawTop, koth, filterCounts, bnbPrice] = await Promise.all([
    listArenaBoardTokens({
      limit,
      offset: 0,
      sortKey,
      sortDir,
      filter,
      airdropAddresses,
    }),
    listTopTokensByMcap(TOP_MCAP_LIMIT),
    getKothSummary(RECENT_STRIP_DESKTOP),
    getArenaFilterCounts(airdropAddresses),
    fetchBnbUsdPrice(),
  ]);

  const [data, topByMcap] = await Promise.all([
    hydrateTokenBoardList(rawBoard),
    hydrateTokenBoardList(rawTop).then((tokens) => sortTokensByMcap(tokens)),
  ]);

  const filteredTotal = filterCounts[filterCountKey(filter)];

  return {
    data,
    topByMcap,
    koth,
    meta: {
      total: filterCounts.all,
      limit,
      hasMore: limit < filteredTotal,
      filterCounts,
    },
    bnbUsd: bnbPrice.bnbUsd,
  };
}

async function loadArenaHomePayloadCached(
  options: ArenaHomeFetchOptions
): Promise<ArenaHomePayload> {
  const fetchOptions: ArenaHomeFetchOptions = {
    limit: options.limit ?? ARENA_HOME_LIMIT,
    sortKey: options.sortKey ?? "age",
    sortDir: options.sortDir ?? "desc",
    filter: options.filter ?? "new",
    airdropAddresses: options.airdropAddresses ?? [],
  };

  if (useRedisArenaCache()) {
    const cached = await readArenaHomeCache(fetchOptions);
    if (cached) return cached;
  }

  const payload = await loadArenaHomePayloadFromDb(fetchOptions);

  if (useRedisArenaCache()) {
    await Promise.all([
      writeArenaHomeCache(fetchOptions, payload),
      writeTopMcapCache(TOP_MCAP_LIMIT, payload.topByMcap),
    ]);
  }

  return payload;
}

/** SSR arena board — short-lived cache for first paint only. */
export async function fetchArenaHomePayload(
  options: ArenaHomeFetchOptions = {}
): Promise<ArenaHomePayload> {
  "use cache";
  cacheTag("arena");
  cacheTag(arenaCacheTag(options));
  cacheLife({ stale: 2, revalidate: 2, expire: 10 });

  return loadArenaHomePayloadCached(options);
}
