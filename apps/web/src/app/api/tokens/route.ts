import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  fetchArenaHomePayload,
  type ArenaHomeFetchOptions,
} from "@/lib/arena-server";
import type {
  ArenaBoardFilter,
  ArenaBoardSortDir,
  ArenaBoardSortKey,
} from "@/lib/db/launchpad";

const CACHE_MS = 2_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

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
  "hasAirdrop",
];

type TokensCacheEntry = {
  expiresAt: number;
  payload: Awaited<ReturnType<typeof fetchArenaHomePayload>>;
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

function cacheKey(options: ArenaHomeFetchOptions & { airdropKey: string }): string {
  return [
    options.limit,
    options.sortKey,
    options.sortDir,
    options.filter,
    options.airdropKey,
  ].join(":");
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
    const fetchOptions: ArenaHomeFetchOptions = {
      limit,
      sortKey,
      sortDir,
      filter,
      airdropAddresses,
    };
    const key = cacheKey({ ...fetchOptions, airdropKey });
    const now = Date.now();
    const cached = tokensCache.get(key);

    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, {
        headers: { "Cache-Control": "private, max-age=2" },
      });
    }

    const payload = await fetchArenaHomePayload(fetchOptions);

    tokensCache.set(key, {
      expiresAt: now + CACHE_MS,
      payload,
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=2" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
