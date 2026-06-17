import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchBnbUsdPrice } from "@/lib/bnb-price-server";
import {
  getArenaFilterCounts,
  getKothSummary,
  listArenaBoardTokens,
  listTopTokensByMcap,
  type ArenaBoardFilter,
  type ArenaBoardSortDir,
  type ArenaBoardSortKey,
  type ArenaListMeta,
  type KothSummary,
  type TokenListItem,
} from "@/lib/db/launchpad";
import { RECENT_STRIP_DESKTOP } from "@/lib/recent-strip-limits";

const CACHE_MS = 2_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const TOP_MCAP_LIMIT = 20;

const BOARD_SORT_KEYS: ArenaBoardSortKey[] = [
  "mcap",
  "ath",
  "age",
  "txns",
  "vol24h",
  "traders",
  "h1",
  "h6",
  "h24",
];

const BOARD_FILTERS: ArenaBoardFilter[] = [
  "all",
  "new",
  "movers",
  "kothContenders",
  "hasAirdrop",
];

type TokensCacheEntry = {
  expiresAt: number;
  data: TokenListItem[];
  topByMcap: TokenListItem[];
  koth: KothSummary | null;
  meta: ArenaListMeta;
  bnbUsd: number | null;
};

const tokensCache = new Map<string, TokensCacheEntry>();

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseSortKey(value: string | null): ArenaBoardSortKey {
  return BOARD_SORT_KEYS.includes(value as ArenaBoardSortKey)
    ? (value as ArenaBoardSortKey)
    : "age";
}

function parseSortDir(value: string | null): ArenaBoardSortDir {
  return value === "asc" ? "asc" : "desc";
}

function parseFilter(value: string | null): ArenaBoardFilter {
  return BOARD_FILTERS.includes(value as ArenaBoardFilter)
    ? (value as ArenaBoardFilter)
    : "all";
}

function parseAirdropAddresses(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter((address) => /^0x[a-f0-9]{40}$/.test(address));
}

function filterCountKey(filter: ArenaBoardFilter): keyof ArenaListMeta["filterCounts"] {
  if (filter === "movers") return "movers";
  if (filter === "kothContenders") return "kothContenders";
  if (filter === "hasAirdrop") return "hasAirdrop";
  if (filter === "new") return "new";
  return "all";
}

function cacheKey(
  limit: number,
  sortKey: ArenaBoardSortKey,
  sortDir: ArenaBoardSortDir,
  filter: ArenaBoardFilter,
  airdropKey: string
): string {
  return `${limit}:${sortKey}:${sortDir}:${filter}:${airdropKey}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const sortKey = parseSortKey(searchParams.get("sortKey"));
    const sortDir = parseSortDir(searchParams.get("sortDir"));
    const filter = parseFilter(searchParams.get("filter"));
    const airdropAddresses = parseAirdropAddresses(searchParams.get("airdrop"));
    const airdropKey = airdropAddresses.join("|");
    const key = cacheKey(limit, sortKey, sortDir, filter, airdropKey);
    const now = Date.now();
    const cached = tokensCache.get(key);

    if (cached && cached.expiresAt > now) {
      return NextResponse.json(
        {
          data: cached.data,
          topByMcap: cached.topByMcap,
          koth: cached.koth,
          meta: cached.meta,
          bnbUsd: cached.bnbUsd,
        },
        { headers: { "Cache-Control": "private, max-age=2" } }
      );
    }

    const [tokens, topByMcap, koth, filterCounts, bnbPrice] = await Promise.all([
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

    const filteredTotal = filterCounts[filterCountKey(filter)];
    const meta: ArenaListMeta = {
      total: filterCounts.all,
      limit,
      hasMore: limit < filteredTotal,
      filterCounts,
    };

    tokensCache.set(key, {
      expiresAt: now + CACHE_MS,
      data: tokens,
      topByMcap,
      koth,
      meta,
      bnbUsd: bnbPrice.bnbUsd,
    });

    return NextResponse.json(
      {
        data: tokens,
        topByMcap,
        koth,
        meta,
        bnbUsd: bnbPrice.bnbUsd,
      },
      { headers: { "Cache-Control": "private, max-age=2" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
