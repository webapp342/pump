import { cacheLife, cacheTag } from "next/cache";
import { fetchBnbUsdPrice } from "@/lib/bnb-price-server";
import { useRedisArenaCache } from "@/lib/db/perf-flags";
import {
  readArenaHomeCache,
  readTopMcapCache,
  writeArenaHomeCache,
  writeTopMcapCache,
} from "@/lib/redis/arena-cache";
import {
  getArenaFilterCounts,
  getKothSummary,
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

/** Server-side arena board payload — SSR home page + shared with /api/tokens. */
export async function fetchArenaHomePayload(
  options: ArenaHomeFetchOptions = {}
): Promise<ArenaHomePayload> {
  "use cache";
  cacheTag("arena");
  cacheTag(arenaCacheTag(options));
  cacheLife({ stale: 2, revalidate: 2, expire: 10 });

  const limit = options.limit ?? ARENA_HOME_LIMIT;
  const sortKey = options.sortKey ?? "age";
  const sortDir = options.sortDir ?? "desc";
  const filter = options.filter ?? "new";
  const airdropAddresses = options.airdropAddresses ?? [];

  const fetchOptions: ArenaHomeFetchOptions = {
    limit,
    sortKey,
    sortDir,
    filter,
    airdropAddresses,
  };

  if (useRedisArenaCache()) {
    const cached = await readArenaHomeCache(fetchOptions);
    if (cached) return cached;
  }

  const [tokens, topByMcapFromDb, koth, filterCounts, bnbPrice] = await Promise.all([
    listArenaBoardTokens({
      limit,
      offset: 0,
      sortKey,
      sortDir,
      filter,
      airdropAddresses,
    }),
    (async () => {
      if (useRedisArenaCache()) {
        const cachedTop = await readTopMcapCache(TOP_MCAP_LIMIT);
        if (cachedTop) return cachedTop;
      }
      return listTopTokensByMcap(TOP_MCAP_LIMIT);
    })(),
    getKothSummary(RECENT_STRIP_DESKTOP),
    getArenaFilterCounts(airdropAddresses),
    fetchBnbUsdPrice(),
  ]);

  const filteredTotal = filterCounts[filterCountKey(filter)];
  const meta: ArenaListMeta = {
    total: filterCounts.all,
    limit,
    hasMore: limit < filteredTotal,
    filterCounts,
  };

  const payload: ArenaHomePayload = {
    data: tokens,
    topByMcap: topByMcapFromDb,
    koth,
    meta,
    bnbUsd: bnbPrice.bnbUsd,
  };

  if (useRedisArenaCache()) {
    await Promise.all([
      writeArenaHomeCache(fetchOptions, payload),
      writeTopMcapCache(TOP_MCAP_LIMIT, topByMcapFromDb),
    ]);
  }

  return payload;
}
