import { Pool } from "pg";
import {
  normalizeAddressParam,
  normalizeTokenAddress,
  normalizeUserStorageAddress,
} from "@/lib/address";
import { isSolanaChainFamily } from "@/config/chain-family";
import { SQL_PROMOTABLE_AIRDROP_LINKED_TOKEN_ADDRESSES } from "@/lib/airdrop-promotable-sql";
import { getLaunchpadReadPool, getLaunchpadWritePool } from "@/lib/db/pool";
import { parseSocialLinksFromDb, type TokenSocialLinks } from "@/lib/token-social";
import { useBondingStateCounts, useMvTokenStats, useTokenBoardStats } from "@/lib/db/perf-flags";
import {
  attachAddressDisplayNames,
  attachCreatorDisplayNames,
  attachHolderDisplayNames,
  attachTraderDisplayNames,
} from "@/lib/user-display";
import { resolveDisplayUsername } from "@/lib/username";
import { getUserUsername } from "@/lib/db/users";
import { sqlChainFilter } from "@/lib/db/launchpad-chain";
import {
  BONDING_TOKEN_SUPPLY_HUMAN,
  BONDING_VIRTUAL_BNB_HUMAN,
  spotPriceBnbFromBondingDecimals,
} from "@/lib/bonding-curve";

/** SQL: marginal spot from bonding_state reserves (human units). */
const SQL_BONDING_MARK_PRICE_ZUG = `
  CASE
    WHEN (${BONDING_TOKEN_SUPPLY_HUMAN}::numeric - COALESCE(b.token_sold, 0)) > 0
    THEN (COALESCE(b.virtual_zug_reserve, ${BONDING_VIRTUAL_BNB_HUMAN})::numeric + COALESCE(b.reserve_zug, 0))
         / (COALESCE(b.virtual_token_reserve, ${BONDING_TOKEN_SUPPLY_HUMAN})::numeric - COALESCE(b.token_sold, 0))
    ELSE COALESCE(b.last_price_zug, 0)
  END
`;

/** SQL: FDV / market cap from bonding mark price × 1B supply. */
const SQL_BONDING_MARK_CAP_ZUG = `((${SQL_BONDING_MARK_PRICE_ZUG}) * ${BONDING_TOKEN_SUPPLY_HUMAN})`;

function resolvePositionMarkPriceBnb(
  reserveZug: string | null | undefined,
  tokenSold: string | null | undefined,
  fallbackLastPrice: string
): string {
  const spot = spotPriceBnbFromBondingDecimals(reserveZug, tokenSold);
  if (spot > 0) return String(spot);
  return fallbackLastPrice;
}

export function getLaunchpadPool(): Pool {
  return getLaunchpadWritePool();
}

export type TokenListItem = {
  address: string;
  symbol: string;
  name: string;
  creatorAddress: string;
  creatorUsername?: string | null;
  creatorDisplayUsername?: string;
  status: string;
  createdAt: string;
  launchBlockNumber: string;
  progressBps: number;
  reserveBnb: string;
  marketCapBnb: string;
  athMarketCapBnb?: string;
  tradeCount?: number;
  volume24hBnb?: string;
  traders24h?: number;
  change1hPct?: number | null;
  change6hPct?: number | null;
  change24hPct?: number | null;
  change24hVolPct?: number | null;
  change24hTxnsPct?: number | null;
  holderCount: number;
  logoUrl: string | null;
  socialLinks: TokenSocialLinks;
  creatorHoldPct: number | null;
  top10HoldPct: number | null;
  /** Active Launch spotlight pin (24h). Enriched client/server for board sort. */
  spotlightPinned?: boolean;
  spotlightExpiresAt?: string | null;
};

export type KothHistoryItem = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  crownedAt: string;
  dethronedAt: string | null;
};

export type KothSummary = {
  activeTokenAddress: string | null;
  crownedAt: string | null;
  recent: KothHistoryItem[];
};

export type ArenaListSort = "age" | "mcap";

export type ArenaBoardSortKey =
  | "mcap"
  | "ath"
  | "age"
  | "txns"
  | "vol24h"
  | "traders"
  | "h1"
  | "h6"
  | "h24";

export type ArenaBoardSortDir = "asc" | "desc";

export type ArenaBoardFilter =
  | "all"
  | "new"
  | "movers"
  | "kothContenders"
  | "hasAirdrop";

export type ArenaBoardListOptions = {
  limit?: number;
  offset?: number;
  sortKey?: ArenaBoardSortKey;
  sortDir?: ArenaBoardSortDir;
  filter?: ArenaBoardFilter;
  airdropAddresses?: string[];
};

export type ArenaFilterCounts = {
  all: number;
  new: number;
  movers: number;
  kothContenders: number;
  hasAirdrop: number;
};

export type ArenaListMeta = {
  total: number;
  limit: number;
  hasMore: boolean;
  filterCounts: ArenaFilterCounts;
};

type TokenListQueryRow = {
  address: string;
  symbol: string;
  name: string;
  creator_address: string;
  status: string;
  created_at: Date;
  launch_block_number: string;
  logo_url: string | null;
  progress_bps: number;
  reserve_zug: string;
  market_cap_zug: string;
  ath_market_cap_zug: string;
  trade_count: number;
  volume_24h_zug: string;
  volume_24h_prev_zug: string;
  trade_count_24h_ago: number;
  traders_24h: number;
  change_1h_pct: string | null;
  change_6h_pct: string | null;
  change_24h_pct: string | null;
  holder_count: number;
  social_links: unknown;
  creator_hold_pct: string | null;
  top10_hold_pct: string | null;
};

function mapTokenListRow(row: TokenListQueryRow): TokenListItem {
  const volume24h = Number(row.volume_24h_zug);
  const volume24hPrev = Number(row.volume_24h_prev_zug);
  const tradeCount = row.trade_count;
  const tradeCount24hAgo = row.trade_count_24h_ago;

  const change24hVolPct =
    volume24hPrev > 0 ? ((volume24h - volume24hPrev) / volume24hPrev) * 100 : null;
  const change24hTxnsPct =
    tradeCount24hAgo > 0 ? ((tradeCount - tradeCount24hAgo) / tradeCount24hAgo) * 100 : null;

  return {
    address: row.address,
    symbol: row.symbol,
    name: row.name,
    creatorAddress: row.creator_address,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    launchBlockNumber: row.launch_block_number,
    progressBps: row.progress_bps,
    reserveBnb: row.reserve_zug,
    marketCapBnb: row.market_cap_zug,
    athMarketCapBnb: row.ath_market_cap_zug,
    tradeCount,
    volume24hBnb: row.volume_24h_zug,
    traders24h: row.traders_24h,
    change1hPct: row.change_1h_pct != null ? Number(row.change_1h_pct) : null,
    change6hPct: row.change_6h_pct != null ? Number(row.change_6h_pct) : null,
    change24hPct: row.change_24h_pct != null ? Number(row.change_24h_pct) : null,
    change24hVolPct,
    change24hTxnsPct,
    holderCount: row.holder_count,
    logoUrl: row.logo_url,
    socialLinks: parseSocialLinksFromDb(row.social_links),
    creatorHoldPct:
      row.creator_hold_pct != null && row.creator_hold_pct !== ""
        ? Number(row.creator_hold_pct)
        : null,
    top10HoldPct:
      row.top10_hold_pct != null && row.top10_hold_pct !== ""
        ? Number(row.top10_hold_pct)
        : null,
  };
}

const TOKEN_LIST_SOCIAL_HOLD_SELECT = `
      COALESCE(tok.social_links, '{}'::jsonb) AS social_links,
      CASE
        WHEN creator_pos.creator_balance IS NOT NULL AND creator_pos.creator_balance > 0
          THEN ((creator_pos.creator_balance / 1000000000.0) * 100)::text
        ELSE NULL
      END AS creator_hold_pct,
      CASE
        WHEN top10_pos.top10_balance > 0
          THEN ((top10_pos.top10_balance / 1000000000.0) * 100)::text
        ELSE NULL
      END AS top10_hold_pct`;

const TOKEN_LIST_SOCIAL_HOLD_JOINS = `
    LEFT JOIN tokens tok ON tok.address = bt.address
    LEFT JOIN LATERAL (
      SELECT p.token_balance AS creator_balance
      FROM user_positions p
      WHERE p.token_address = bt.address
        AND p.address = bt.creator_address
        AND p.token_balance > 0
      LIMIT 1
    ) creator_pos ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(h.token_balance), 0) AS top10_balance
      FROM (
        SELECT token_balance
        FROM user_positions
        WHERE token_address = bt.address
          AND token_balance > 0
        ORDER BY token_balance DESC
        LIMIT 10
      ) h
    ) top10_pos ON true`;

const TOKEN_LIST_SELECT = `
    SELECT
      bt.address,
      bt.symbol,
      bt.name,
      bt.creator_address,
      bt.status,
      bt.created_at,
      bt.launch_block_number,
      bt.logo_url,
      COALESCE(b.progress_bps, 0) AS progress_bps,
      COALESCE(b.reserve_zug, 0)::text AS reserve_zug,
      COALESCE(b.market_cap_zug, (${SQL_BONDING_MARK_CAP_ZUG}), 0)::text AS market_cap_zug,
      COALESCE(
        ts.ath_price_zug * 1000000000,
        (${SQL_BONDING_MARK_CAP_ZUG}),
        0
      )::text AS ath_market_cap_zug,
      COALESCE(ts.trade_count, COALESCE(b.trade_count, 0)) AS trade_count,
      COALESCE(ts.volume_24h_zug, '0') AS volume_24h_zug,
      COALESCE(ts.volume_24h_prev_zug, '0') AS volume_24h_prev_zug,
      COALESCE(ts.trade_count_24h_ago, 0) AS trade_count_24h_ago,
      COALESCE(ts.traders_24h, 0) AS traders_24h,
      CASE
        WHEN p1h.price_zug IS NOT NULL AND p1h.price_zug > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - p1h.price_zug) / p1h.price_zug) * 100)::text
        ELSE NULL
      END AS change_1h_pct,
      CASE
        WHEN p6h.price_zug IS NOT NULL AND p6h.price_zug > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - p6h.price_zug) / p6h.price_zug) * 100)::text
        ELSE NULL
      END AS change_6h_pct,
      CASE
        WHEN COALESCE(p24h_prev.price_zug, p_first.price_zug) IS NOT NULL
             AND COALESCE(p24h_prev.price_zug, p_first.price_zug) > 0
          THEN (
            (
              (${SQL_BONDING_MARK_PRICE_ZUG}) - COALESCE(p24h_prev.price_zug, p_first.price_zug)
            ) / COALESCE(p24h_prev.price_zug, p_first.price_zug) * 100
          )::text
        ELSE NULL
      END AS change_24h_pct,
      COALESCE(b.holder_count, 0) AS holder_count,
      ${TOKEN_LIST_SOCIAL_HOLD_SELECT}
    FROM base_tokens bt
    LEFT JOIN bonding_states b ON b.token_address = bt.address
    LEFT JOIN trade_stats ts ON ts.token_address = bt.address
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
        AND tr.block_time >= now() - interval '1 hour'
      ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
      LIMIT 1
    ) p1h ON true
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
        AND tr.block_time >= now() - interval '6 hours'
      ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
      LIMIT 1
    ) p6h ON true
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
        AND tr.block_time <= now() - interval '24 hours'
      ORDER BY tr.block_time DESC, tr.block_number DESC, tr.log_index DESC
      LIMIT 1
    ) p24h_prev ON true
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
      ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
      LIMIT 1
    ) p_first ON true
    ${TOKEN_LIST_SOCIAL_HOLD_JOINS}
`;

const TOKEN_LIST_SELECT_BONDING = `
    SELECT
      bt.address,
      bt.symbol,
      bt.name,
      bt.creator_address,
      bt.status,
      bt.created_at,
      bt.launch_block_number,
      bt.logo_url,
      COALESCE(b.progress_bps, 0) AS progress_bps,
      COALESCE(b.reserve_zug, 0)::text AS reserve_zug,
      COALESCE(b.market_cap_zug, (${SQL_BONDING_MARK_CAP_ZUG}), 0)::text AS market_cap_zug,
      COALESCE(
        ts.ath_price_zug * 1000000000,
        (${SQL_BONDING_MARK_CAP_ZUG}),
        0
      )::text AS ath_market_cap_zug,
      COALESCE(b.trade_count, 0) AS trade_count,
      COALESCE(ts.volume_24h_zug, '0') AS volume_24h_zug,
      COALESCE(ts.volume_24h_prev_zug, '0') AS volume_24h_prev_zug,
      COALESCE(ts.trade_count_24h_ago, 0) AS trade_count_24h_ago,
      COALESCE(ts.traders_24h, 0) AS traders_24h,
      CASE
        WHEN p1h.price_zug IS NOT NULL AND p1h.price_zug > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - p1h.price_zug) / p1h.price_zug) * 100)::text
        ELSE NULL
      END AS change_1h_pct,
      CASE
        WHEN p6h.price_zug IS NOT NULL AND p6h.price_zug > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - p6h.price_zug) / p6h.price_zug) * 100)::text
        ELSE NULL
      END AS change_6h_pct,
      CASE
        WHEN COALESCE(p24h_prev.price_zug, p_first.price_zug) IS NOT NULL
             AND COALESCE(p24h_prev.price_zug, p_first.price_zug) > 0
          THEN (
            (
              (${SQL_BONDING_MARK_PRICE_ZUG}) - COALESCE(p24h_prev.price_zug, p_first.price_zug)
            ) / COALESCE(p24h_prev.price_zug, p_first.price_zug) * 100
          )::text
        ELSE NULL
      END AS change_24h_pct,
      COALESCE(b.holder_count, 0) AS holder_count,
      ${TOKEN_LIST_SOCIAL_HOLD_SELECT}
    FROM base_tokens bt
    LEFT JOIN bonding_states b ON b.token_address = bt.address
    LEFT JOIN trade_stats ts ON ts.token_address = bt.address
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
        AND tr.block_time >= now() - interval '1 hour'
      ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
      LIMIT 1
    ) p1h ON true
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
        AND tr.block_time >= now() - interval '6 hours'
      ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
      LIMIT 1
    ) p6h ON true
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
        AND tr.block_time <= now() - interval '24 hours'
      ORDER BY tr.block_time DESC, tr.block_number DESC, tr.log_index DESC
      LIMIT 1
    ) p24h_prev ON true
    LEFT JOIN LATERAL (
      SELECT tr.price_zug
      FROM trades tr
      WHERE tr.token_address = bt.address
      ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
      LIMIT 1
    ) p_first ON true
    ${TOKEN_LIST_SOCIAL_HOLD_JOINS}
`;

const TOKEN_LIST_SELECT_MV = `
    SELECT
      bt.address,
      bt.symbol,
      bt.name,
      bt.creator_address,
      bt.status,
      bt.created_at,
      bt.launch_block_number,
      bt.logo_url,
      COALESCE(b.progress_bps, 0) AS progress_bps,
      COALESCE(b.reserve_zug, 0)::text AS reserve_zug,
      COALESCE(b.market_cap_zug, (${SQL_BONDING_MARK_CAP_ZUG}), 0)::text AS market_cap_zug,
      COALESCE(
        mts.ath_price_zug * 1000000000,
        (${SQL_BONDING_MARK_CAP_ZUG}),
        0
      )::text AS ath_market_cap_zug,
      COALESCE(mts.trade_count, COALESCE(b.trade_count, 0)) AS trade_count,
      COALESCE(mts.volume_24h_zug, '0') AS volume_24h_zug,
      COALESCE(mts.volume_24h_prev_zug, '0') AS volume_24h_prev_zug,
      COALESCE(mts.trade_count_24h_ago, 0) AS trade_count_24h_ago,
      COALESCE(mts.traders_24h, 0) AS traders_24h,
      CASE
        WHEN mpa.price_1h_ago IS NOT NULL AND mpa.price_1h_ago > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - mpa.price_1h_ago) / mpa.price_1h_ago) * 100)::text
        ELSE NULL
      END AS change_1h_pct,
      CASE
        WHEN mpa.price_6h_ago IS NOT NULL AND mpa.price_6h_ago > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - mpa.price_6h_ago) / mpa.price_6h_ago) * 100)::text
        ELSE NULL
      END AS change_6h_pct,
      CASE
        WHEN COALESCE(mpa.price_24h_ago, mpa.price_first) IS NOT NULL
             AND COALESCE(mpa.price_24h_ago, mpa.price_first) > 0
          THEN (
            (
              (${SQL_BONDING_MARK_PRICE_ZUG}) - COALESCE(mpa.price_24h_ago, mpa.price_first)
            ) / COALESCE(mpa.price_24h_ago, mpa.price_first) * 100
          )::text
        ELSE NULL
      END AS change_24h_pct,
      COALESCE(b.holder_count, 0) AS holder_count,
      ${TOKEN_LIST_SOCIAL_HOLD_SELECT}
    FROM base_tokens bt
    LEFT JOIN bonding_states b ON b.token_address = bt.address
    LEFT JOIN mv_token_trade_stats mts ON mts.token_address = bt.address
    LEFT JOIN mv_token_price_anchors mpa ON mpa.token_address = bt.address
    ${TOKEN_LIST_SOCIAL_HOLD_JOINS}
`;

const TOKEN_LIST_SELECT_BOARD_STATS = `
    SELECT
      bt.address,
      bt.symbol,
      bt.name,
      bt.creator_address,
      bt.status,
      bt.created_at,
      bt.launch_block_number,
      bt.logo_url,
      COALESCE(tbs.progress_bps, b.progress_bps, 0) AS progress_bps,
      COALESCE(tbs.reserve_zug, b.reserve_zug, 0)::text AS reserve_zug,
      COALESCE(b.market_cap_zug, (${SQL_BONDING_MARK_CAP_ZUG}), tbs.market_cap_zug, 0)::text AS market_cap_zug,
      COALESCE(
        GREATEST(
          COALESCE(b.market_cap_zug, (${SQL_BONDING_MARK_CAP_ZUG}), 0),
          COALESCE(mts.ath_price_zug * 1000000000, 0)
        ),
        tbs.ath_market_cap_zug,
        (${SQL_BONDING_MARK_CAP_ZUG}),
        0
      )::text AS ath_market_cap_zug,
      COALESCE(tbs.trade_count, b.trade_count, 0) AS trade_count,
      COALESCE(tbs.volume_24h_zug, 0)::text AS volume_24h_zug,
      COALESCE(tbs.volume_24h_prev_zug, 0)::text AS volume_24h_prev_zug,
      COALESCE(tbs.trade_count_24h_ago, 0) AS trade_count_24h_ago,
      COALESCE(tbs.traders_24h, 0) AS traders_24h,
      CASE
        WHEN mpa.price_1h_ago IS NOT NULL AND mpa.price_1h_ago > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - mpa.price_1h_ago) / mpa.price_1h_ago) * 100)::text
        ELSE NULL
      END AS change_1h_pct,
      CASE
        WHEN mpa.price_6h_ago IS NOT NULL AND mpa.price_6h_ago > 0
          THEN ((((${SQL_BONDING_MARK_PRICE_ZUG}) - mpa.price_6h_ago) / mpa.price_6h_ago) * 100)::text
        ELSE NULL
      END AS change_6h_pct,
      CASE
        WHEN COALESCE(mpa.price_24h_ago, mpa.price_first) IS NOT NULL
             AND COALESCE(mpa.price_24h_ago, mpa.price_first) > 0
          THEN (
            (
              (${SQL_BONDING_MARK_PRICE_ZUG}) - COALESCE(mpa.price_24h_ago, mpa.price_first)
            ) / COALESCE(mpa.price_24h_ago, mpa.price_first) * 100
          )::text
        ELSE NULL
      END AS change_24h_pct,
      COALESCE(tbs.holder_count, b.holder_count, 0) AS holder_count,
      ${TOKEN_LIST_SOCIAL_HOLD_SELECT}
    FROM base_tokens bt
    LEFT JOIN bonding_states b ON b.token_address = bt.address
    LEFT JOIN token_board_stats tbs ON tbs.token_address = bt.address
    LEFT JOIN mv_token_trade_stats mts ON mts.token_address = bt.address
    LEFT JOIN mv_token_price_anchors mpa ON mpa.token_address = bt.address
    ${TOKEN_LIST_SOCIAL_HOLD_JOINS}
`;

function buildTokenListSelectSql(baseTokensInner: string): string {
  if (useTokenBoardStats()) {
    return `
    WITH base_tokens AS (
      ${baseTokensInner}
    )
    ${TOKEN_LIST_SELECT_BOARD_STATS}`;
  }

  if (useMvTokenStats()) {
    return `
    WITH base_tokens AS (
      ${baseTokensInner}
    )
    ${TOKEN_LIST_SELECT_MV}`;
  }

  const select = useBondingStateCounts() ? TOKEN_LIST_SELECT_BONDING : TOKEN_LIST_SELECT;
  return `
    WITH base_tokens AS (
      ${baseTokensInner}
    ),
    ${TOKEN_TRADE_STATS_CTE}
    ${select}`;
}

function buildTokenListSql(baseTokensInner: string, orderBy: string): string {
  return `${buildTokenListSelectSql(baseTokensInner)}
    ${orderBy}`;
}

function arenaBoardOrderClause(
  sortKey: ArenaBoardSortKey,
  sortDir: ArenaBoardSortDir
): string {
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  const nulls = sortDir === "asc" ? "NULLS FIRST" : "NULLS LAST";
  const columnBySort: Record<ArenaBoardSortKey, string> = {
    mcap: "market_cap_zug::numeric",
    ath: "ath_market_cap_zug::numeric",
    age: "created_at",
    txns: "trade_count",
    vol24h: "volume_24h_zug::numeric",
    traders: "traders_24h",
    h1: "change_1h_pct::numeric",
    h6: "change_6h_pct::numeric",
    h24: "change_24h_pct::numeric",
  };
  const primary = columnBySort[sortKey];
  const tieBreaker = sortKey === "age" ? "" : ", created_at DESC";
  return `ORDER BY ${primary} ${dir} ${nulls}${tieBreaker}`;
}

function arenaBoardFilterClause(
  filter: ArenaBoardFilter,
  airdropAddresses: string[]
): { clause: string; params: string[] } {
  if (filter === "movers") {
    return {
      clause:
        "WHERE change_24h_pct IS NOT NULL AND ABS(change_24h_pct::numeric) >= 1",
      params: [],
    };
  }
  if (filter === "hasAirdrop") {
    if (airdropAddresses.length > 0) {
      return {
        clause: "WHERE LOWER(address) = ANY($3::text[])",
        params: airdropAddresses.map((address) => address.toLowerCase()),
      };
    }
    return {
      clause: `WHERE LOWER(address) IN (${SQL_PROMOTABLE_AIRDROP_LINKED_TOKEN_ADDRESSES})`,
      params: [],
    };
  }
  if (filter === "kothContenders") {
    return {
      clause: `WHERE address IN (
        SELECT t.address
        FROM tokens t
        LEFT JOIN bonding_states b ON b.token_address = t.address
        WHERE t.is_hidden = false
        ORDER BY COALESCE(b.market_cap_zug, 0) DESC
        LIMIT 5
      )`,
      params: [],
    };
  }
  return { clause: "", params: [] };
}

export async function listArenaBoardTokens(
  options: ArenaBoardListOptions = {}
): Promise<TokenListItem[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const sortKey = options.sortKey ?? "age";
  const sortDir = options.sortDir ?? "desc";
  const filter = options.filter ?? "all";
  const airdropAddresses = options.airdropAddresses ?? [];

  const { clause: filterClause, params: filterParams } = arenaBoardFilterClause(
    filter,
    airdropAddresses
  );
  const sql = `
    SELECT *
    FROM (
      ${buildTokenListSelectSql(ARENA_TOKEN_BASE_INNER)}
    ) arena_list
    ${filterClause}
    ${arenaBoardOrderClause(sortKey, sortDir)}
    LIMIT $1 OFFSET $2
  `;

  const db = getLaunchpadReadPool();
  const queryParams =
    filterParams.length > 0 ? [limit, offset, filterParams] : [limit, offset];
  const result = await db.query<TokenListQueryRow>(sql, queryParams);
  return attachCreatorDisplayNames(result.rows.map(mapTokenListRow));
}

export async function listTokenListItemsByAddresses(
  addresses: string[]
): Promise<TokenListItem[]> {
  const normalized = [
    ...new Set(
      addresses
        .map((address) => address.toLowerCase())
        .filter((address) => /^0x[a-f0-9]{40}$/.test(address))
    ),
  ];
  if (normalized.length === 0) return [];

  const baseInner = `
      SELECT
        t.address,
        t.symbol,
        t.name,
        t.creator_address,
        t.status,
        t.created_at,
        t.launch_block_number::text,
        t.logo_url
      FROM tokens t
      WHERE t.is_hidden = false
        AND LOWER(t.address) = ANY($1::text[])
    `;

  const db = getLaunchpadReadPool();
  const sql = `${buildTokenListSelectSql(baseInner)} ORDER BY bt.created_at DESC`;
  const result = await db.query<TokenListQueryRow>(sql, [normalized]);
  return attachCreatorDisplayNames(result.rows.map(mapTokenListRow));
}

async function countKothContenders(): Promise<number> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM (
        SELECT t.address
        FROM tokens t
        LEFT JOIN bonding_states b ON b.token_address = t.address
        WHERE t.is_hidden = false
        ORDER BY COALESCE(b.market_cap_zug, 0) DESC
        LIMIT 5
      ) koth
    `
  );
  return Number(result.rows[0]?.count ?? 0);
}

const TOKEN_TRADE_STATS_CTE = `
    trade_stats AS (
      SELECT
        tr.token_address,
        COUNT(*)::integer AS trade_count,
        COALESCE(
          SUM(GREATEST(tr.zug_amount - COALESCE(tr.fee_zug, 0), 0))
            FILTER (WHERE tr.block_time >= now() - interval '24 hours'),
          0
        )::text AS volume_24h_zug,
        COALESCE(
          SUM(GREATEST(tr.zug_amount - COALESCE(tr.fee_zug, 0), 0)) FILTER (
            WHERE tr.block_time >= now() - interval '48 hours'
              AND tr.block_time < now() - interval '24 hours'
          ),
          0
        )::text AS volume_24h_prev_zug,
        COUNT(*) FILTER (WHERE tr.block_time < now() - interval '24 hours')::integer AS trade_count_24h_ago,
        COUNT(DISTINCT tr.trader_address) FILTER (WHERE tr.block_time >= now() - interval '24 hours')::integer AS traders_24h,
        MAX(tr.price_zug) AS ath_price_zug
      FROM trades tr
      JOIN base_tokens bt ON bt.address = tr.token_address
      GROUP BY tr.token_address
    )
`;

const ARENA_TOKEN_BASE_INNER = `
      SELECT
        t.address,
        t.symbol,
        t.name,
        t.creator_address,
        t.status,
        t.created_at,
        t.launch_block_number::text,
        t.logo_url
      FROM tokens t
      WHERE t.is_hidden = false
        ${sqlChainFilter("t")}
    `;

function arenaListOrderBy(sort: ArenaListSort): string {
  if (sort === "age") {
    return "ORDER BY bt.created_at DESC";
  }
  return "ORDER BY COALESCE(b.market_cap_zug, 0) DESC, bt.created_at DESC";
}

export async function listTokensPaginated(
  options: { limit?: number; offset?: number; sort?: ArenaListSort } = {}
): Promise<TokenListItem[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const sort = options.sort ?? "age";
  const db = getLaunchpadReadPool();
  const sql = buildTokenListSql(
    ARENA_TOKEN_BASE_INNER,
    `${arenaListOrderBy(sort)} LIMIT $1 OFFSET $2`
  );
  const result = await db.query<TokenListQueryRow>(sql, [limit, offset]);

  return attachCreatorDisplayNames(result.rows.map(mapTokenListRow));
}

export async function listTokens(limit = 50): Promise<TokenListItem[]> {
  return listTokensPaginated({ limit, offset: 0, sort: "age" });
}

export async function listTopTokensByMcap(limit = 20): Promise<TokenListItem[]> {
  return listTokensPaginated({ limit, offset: 0, sort: "mcap" });
}

export async function countVisibleTokens(): Promise<number> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tokens t WHERE t.is_hidden = false ${sqlChainFilter("t")}`
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getArenaFilterCounts(
  _airdropAddresses: string[] = []
): Promise<ArenaFilterCounts> {
  const db = getLaunchpadReadPool();
  const total = await countVisibleTokens();
  const kothContenders = await countKothContenders();

  if (useMvTokenStats()) {
    const result = await db.query<{
      movers: number;
      has_airdrop: number;
    }>(
      `
      WITH enriched AS (
        SELECT
          t.address,
          CASE
            WHEN COALESCE(mpa.price_24h_ago, mpa.price_first) IS NOT NULL
                 AND COALESCE(mpa.price_24h_ago, mpa.price_first) > 0
              THEN (
                (
                  (${SQL_BONDING_MARK_PRICE_ZUG}) - COALESCE(mpa.price_24h_ago, mpa.price_first)
                ) / COALESCE(mpa.price_24h_ago, mpa.price_first) * 100
              )
            ELSE NULL
          END AS change_24h_pct
        FROM tokens t
        LEFT JOIN bonding_states b ON b.token_address = t.address
        LEFT JOIN mv_token_price_anchors mpa ON mpa.token_address = t.address
        WHERE t.is_hidden = false
      ),
      promotable AS (
        ${SQL_PROMOTABLE_AIRDROP_LINKED_TOKEN_ADDRESSES}
      )
      SELECT
        COUNT(*) FILTER (
          WHERE change_24h_pct IS NOT NULL AND ABS(change_24h_pct) >= 1
        )::int AS movers,
        (SELECT COUNT(*)::int FROM promotable) AS has_airdrop
      FROM enriched
      `
    );
    const row = result.rows[0];
    return {
      all: total,
      new: total,
      movers: row?.movers ?? 0,
      kothContenders,
      hasAirdrop: row?.has_airdrop ?? 0,
    };
  }

  const result = await db.query<{
    movers: number;
    has_airdrop: number;
  }>(
    `
    WITH enriched AS (
      SELECT
        t.address,
        CASE
          WHEN COALESCE(p24h_prev.price_zug, p_first.price_zug) IS NOT NULL
               AND COALESCE(p24h_prev.price_zug, p_first.price_zug) > 0
            THEN (
              (
                (${SQL_BONDING_MARK_PRICE_ZUG}) - COALESCE(p24h_prev.price_zug, p_first.price_zug)
              ) / COALESCE(p24h_prev.price_zug, p_first.price_zug) * 100
            )
          ELSE NULL
        END AS change_24h_pct
      FROM tokens t
      LEFT JOIN bonding_states b ON b.token_address = t.address
      LEFT JOIN LATERAL (
        SELECT tr.price_zug
        FROM trades tr
        WHERE tr.token_address = t.address
          AND tr.block_time <= now() - interval '24 hours'
        ORDER BY tr.block_time DESC, tr.block_number DESC, tr.log_index DESC
        LIMIT 1
      ) p24h_prev ON true
      LEFT JOIN LATERAL (
        SELECT tr.price_zug
        FROM trades tr
        WHERE tr.token_address = t.address
        ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
        LIMIT 1
      ) p_first ON true
      WHERE t.is_hidden = false
    ),
    promotable AS (
      ${SQL_PROMOTABLE_AIRDROP_LINKED_TOKEN_ADDRESSES}
    )
    SELECT
      COUNT(*) FILTER (
        WHERE change_24h_pct IS NOT NULL AND ABS(change_24h_pct) >= 1
      )::int AS movers,
      (SELECT COUNT(*)::int FROM promotable) AS has_airdrop
    FROM enriched
    `
  );
  const row = result.rows[0];
  return {
    all: total,
    new: total,
    movers: row?.movers ?? 0,
    kothContenders,
    hasAirdrop: row?.has_airdrop ?? 0,
  };
}

export async function listTokensByCreator(
  creatorAddress: string,
  limit?: number,
  offset = 0
): Promise<TokenListItem[]> {
  const db = getLaunchpadReadPool();
  const normalized = creatorAddress.toLowerCase();
  let orderBy = limit ? "ORDER BY bt.created_at DESC LIMIT $2" : "ORDER BY bt.created_at DESC";
  const params: (string | number)[] = [normalized];

  if (limit) {
    params.push(limit);
    if (offset > 0) {
      orderBy += " OFFSET $3";
      params.push(offset);
    }
  }

  const sql = buildTokenListSql(
    `
      SELECT
        t.address,
        t.symbol,
        t.name,
        t.creator_address,
        t.status,
        t.created_at,
        t.launch_block_number::text,
        t.logo_url
      FROM tokens t
      WHERE t.creator_address = $1
        AND t.is_hidden = false
      ORDER BY t.created_at DESC
    `,
    orderBy
  );
  const result = await db.query<TokenListQueryRow>(sql, params);

  return attachCreatorDisplayNames(result.rows.map(mapTokenListRow));
}

export async function countTokensByCreator(creatorAddress: string): Promise<number> {
  const db = getLaunchpadReadPool();
  const normalized = creatorAddress.toLowerCase();
  const result = await db.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM tokens
      WHERE creator_address = $1
        AND is_hidden = false
    `,
    [normalized]
  );
  return result.rows[0]?.count ?? 0;
}

export async function getKothSummary(limit = 5): Promise<KothSummary | null> {
  const db = getLaunchpadReadPool();

  try {
    const [activeResult, recentResult] = await Promise.all([
      db.query<{
        token_address: string;
        crowned_at: Date;
      }>(
        `
        SELECT kh.token_address, kh.crowned_at
        FROM king_history kh
        JOIN tokens t ON t.address = kh.token_address
        WHERE kh.dethroned_at IS NULL
          AND t.is_hidden = false
        ORDER BY kh.crowned_at DESC
        LIMIT 1
        `
      ),
      db.query<{
        token_address: string;
        symbol: string;
        name: string;
        logo_url: string | null;
        crowned_at: Date;
        dethroned_at: Date | null;
      }>(
        `
        SELECT
          kh.token_address,
          t.symbol,
          t.name,
          t.logo_url,
          kh.crowned_at,
          kh.dethroned_at
        FROM king_history kh
        JOIN tokens t ON t.address = kh.token_address
        WHERE t.is_hidden = false
        ORDER BY kh.crowned_at DESC
        LIMIT $1
        `,
        [limit]
      ),
    ]);

    const active = activeResult.rows[0] ?? null;
    return {
      activeTokenAddress: active?.token_address ?? null,
      crownedAt: active?.crowned_at?.toISOString() ?? null,
      recent: recentResult.rows.map((row) => ({
        tokenAddress: row.token_address,
        symbol: row.symbol,
        name: row.name,
        logoUrl: row.logo_url,
        crownedAt: row.crowned_at.toISOString(),
        dethronedAt: row.dethroned_at?.toISOString() ?? null,
      })),
    };
  } catch (error) {
    if (error instanceof Error && /king_history/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

/** Persist logo URL after R2 upload (no-op if token row not indexed yet). */
export async function setTokenLogoUrl(address: string, logoUrl: string): Promise<void> {
  const db = getLaunchpadWritePool();
  const normalized = isSolanaChainFamily
    ? normalizeTokenAddress(address)
    : address.toLowerCase();
  const storedUrl = logoUrl.split("?")[0];

  const updated = await db.query(
    `UPDATE tokens SET logo_url = $2, updated_at = now() WHERE address = $1`,
    [normalized, storedUrl]
  );

  if ((updated.rowCount ?? 0) === 0) {
    return;
  }

  await db.query(
    `
    INSERT INTO token_media (token_address, media_type, url)
    VALUES ($1, 'LOGO', $2)
    ON CONFLICT (token_address, media_type) DO UPDATE SET url = EXCLUDED.url
    `,
    [normalized, storedUrl]
  );
}

export type TokenDetail = TokenListItem & {
  createdAt: string;
  description: string | null;
  socialLinks: TokenSocialLinks;
  logoUrl: string | null;
  launchTxHash: string;
  creatorFollowerCount: number;
  targetBnb: string;
  tokenSold: string;
  tradeCount: number;
  lastPriceBnb: string;
};

export async function upsertTokenMetadata(input: {
  address: string;
  chainId: number;
  creatorAddress: string;
  name: string;
  symbol: string;
  launchTxHash: string;
  launchBlockNumber: string;
  description: string | null;
  socialLinks: TokenSocialLinks;
}): Promise<void> {
  const db = getLaunchpadWritePool();
  const normalized = normalizeAddressParam(input.address) ?? input.address;
  const creatorAddress = isSolanaChainFamily
    ? normalizeUserStorageAddress(input.creatorAddress)
    : input.creatorAddress.toLowerCase();
  const launchTxHash = isSolanaChainFamily
    ? input.launchTxHash.trim()
    : input.launchTxHash.toLowerCase();

  await db.query(
    `
    INSERT INTO tokens (
      address,
      chain_id,
      creator_address,
      name,
      symbol,
      launch_tx_hash,
      launch_block_number,
      description,
      social_links
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    ON CONFLICT (address) DO UPDATE SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), tokens.name),
      symbol = COALESCE(NULLIF(EXCLUDED.symbol, ''), tokens.symbol),
      description = COALESCE(EXCLUDED.description, tokens.description),
      social_links = CASE
        WHEN EXCLUDED.social_links = '{}'::jsonb THEN tokens.social_links
        ELSE EXCLUDED.social_links
      END,
      updated_at = now()
    `,
    [
      normalized,
      input.chainId,
      creatorAddress,
      input.name,
      input.symbol,
      launchTxHash,
      input.launchBlockNumber,
      input.description,
      JSON.stringify(input.socialLinks),
    ]
  );
}

export type TradeItem = {
  id: string;
  side: string;
  traderAddress: string;
  traderUsername?: string | null;
  traderDisplayUsername?: string;
  /** Gross native BNB from Trade event. */
  nativeAmount: string;
  feeBnb?: string;
  netBnb?: string;
  tokenAmount: string;
  /** Execution fill price (BNB per token). */
  priceBnb: string;
  /** Bonding-curve spot after trade when indexed. */
  spotPriceBnb?: string;
  /** Native/USD at trade time (frozen tape USD). */
  nativeUsdRate?: string;
  txHash: string;
  blockTime: string;
};

export type TokenHolderSnapshot = {
  address: string;
  displayUsername?: string;
  tokenBalance: string;
  onChainBalance?: string;
  totalBoughtBnb: string;
  totalSoldBnb: string;
  realizedPnlBnb: string;
  remainingCostBasisBnb: string;
  remainingCostBasisUsd?: string;
  realizedPnlUsd?: string;
  /** Open-lot start (earliest open lot); client shows “Held …”. */
  heldSince?: string | null;
};

/** Cheap top-mcap address for trade default redirect when Redis is cold. */
export async function getTopTokenAddressByMcap(): Promise<string | null> {
  const db = getLaunchpadReadPool();

  if (useTokenBoardStats()) {
    const board = await db.query<{ token_address: string }>(
      `
      SELECT tbs.token_address
      FROM token_board_stats tbs
      INNER JOIN tokens t ON t.address = tbs.token_address AND t.is_hidden = false
      ORDER BY tbs.market_cap_zug DESC NULLS LAST
      LIMIT 1
      `
    );
    if (board.rows[0]?.token_address) {
      return board.rows[0].token_address.toLowerCase();
    }
  }

  const bonding = await db.query<{ token_address: string }>(
    `
    SELECT b.token_address
    FROM bonding_states b
    INNER JOIN tokens t ON t.address = b.token_address AND t.is_hidden = false
    WHERE b.market_cap_zug > 0
    ORDER BY b.market_cap_zug DESC
    LIMIT 1
    `
  );
  return bonding.rows[0]?.token_address?.toLowerCase() ?? null;
}

export async function getTokenByAddress(address: string): Promise<TokenDetail | null> {
  const db = getLaunchpadReadPool();
  const normalized = normalizeAddressParam(address);
  if (!normalized) return null;

  const result = await db.query<{
    address: string;
    symbol: string;
    name: string;
    creator_address: string;
    status: string;
    launch_block_number: string;
    created_at: Date;
    description: string | null;
    social_links: unknown;
    logo_url: string | null;
    launch_tx_hash: string;
    progress_bps: number;
    reserve_zug: string;
    market_cap_zug: string;
    holder_count: number;
    target_zug: string;
    token_sold: string;
    trade_count: number;
    last_price_zug: string;
    creator_follower_count: number;
  }>(
    `
    SELECT
      t.address,
      t.symbol,
      t.name,
      t.creator_address,
      t.status,
      t.launch_block_number::text,
      t.created_at,
      t.description,
      COALESCE(t.social_links, '{}'::jsonb) AS social_links,
      t.logo_url,
      t.launch_tx_hash,
      COALESCE(b.progress_bps, 0) AS progress_bps,
      COALESCE(b.reserve_zug, 0)::text AS reserve_zug,
      COALESCE(b.market_cap_zug, 0)::text AS market_cap_zug,
      COALESCE(b.holder_count, 0) AS holder_count,
      COALESCE(b.target_zug, 0)::text AS target_zug,
      COALESCE(b.token_sold, 0)::text AS token_sold,
      COALESCE(b.trade_count, 0) AS trade_count,
      COALESCE((${SQL_BONDING_MARK_PRICE_ZUG}), 0)::text AS last_price_zug,
      COALESCE((
        SELECT COUNT(*)::int
        FROM creator_follows cf
        WHERE cf.creator_address = t.creator_address
      ), 0) AS creator_follower_count
    FROM tokens t
    LEFT JOIN bonding_states b ON b.token_address = t.address
    WHERE t.address = $1 AND t.is_hidden = false
    `,
    [normalized]
  );

  const row = result.rows[0];
  if (!row) return null;

  const creatorUsername = await getUserUsername(row.creator_address);

  return {
    address: row.address,
    symbol: row.symbol,
    name: row.name,
    creatorAddress: row.creator_address,
    creatorUsername,
    creatorDisplayUsername: resolveDisplayUsername(row.creator_address, creatorUsername, true),
    status: row.status,
    launchBlockNumber: row.launch_block_number,
    createdAt: row.created_at.toISOString(),
    description: row.description,
    socialLinks: parseSocialLinksFromDb(row.social_links),
    logoUrl: row.logo_url,
    launchTxHash: row.launch_tx_hash,
    creatorFollowerCount: row.creator_follower_count,
    progressBps: row.progress_bps,
    reserveBnb: row.reserve_zug,
    marketCapBnb: row.market_cap_zug,
    holderCount: row.holder_count,
    creatorHoldPct: null,
    top10HoldPct: null,
    targetBnb: row.target_zug,
    tokenSold: row.token_sold,
    tradeCount: row.trade_count,
    lastPriceBnb: row.last_price_zug,
  };
}

export async function listTradesForToken(
  address: string,
  limit = 20,
  offset = 0
): Promise<TradeItem[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{
    id: string;
    side: string;
    trader_address: string;
    zug_amount: string;
    fee_zug: string;
    token_amount: string;
    price_zug: string;
    native_usd_rate: string | null;
    tx_hash: string;
    block_time: Date;
  }>(
    `
    SELECT
      id::text,
      side,
      trader_address,
      zug_amount::text,
      fee_zug::text,
      token_amount::text,
      price_zug::text,
      native_usd_rate::text,
      tx_hash,
      block_time
    FROM trades
    WHERE token_address = $1
    ORDER BY block_number DESC, log_index DESC
    LIMIT $2 OFFSET $3
    `,
    [address.toLowerCase(), limit, offset]
  );

  return attachTraderDisplayNames(
    result.rows.map((row) => {
      const gross = Number(row.zug_amount);
      const fee = Number(row.fee_zug);
      const net = Math.max(0, gross - fee);
      return {
        id: row.id,
        side: row.side,
        traderAddress: row.trader_address,
        nativeAmount: row.zug_amount,
        feeBnb: row.fee_zug,
        netBnb: String(net),
        tokenAmount: row.token_amount,
        priceBnb: row.price_zug,
        nativeUsdRate: row.native_usd_rate ?? undefined,
        txHash: row.tx_hash,
        blockTime: row.block_time.toISOString(),
      };
    })
  );
}

export async function countTradesForToken(address: string): Promise<number> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM trades WHERE token_address = $1`,
    [address.toLowerCase()]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function listTokenHolders(
  tokenAddress: string,
  limit = 20,
  offset = 0
): Promise<TokenHolderSnapshot[]> {
  const db = getLaunchpadReadPool();
  const normalized = tokenAddress.toLowerCase();

  type HolderDbRow = {
    address: string;
    token_balance: string;
    total_bought_zug: string;
    total_sold_zug: string;
    realized_pnl_zug: string;
    remaining_cost_basis_zug: string;
    remaining_cost_basis_usd: string;
    realized_pnl_usd: string;
    held_since?: Date | null;
  };

  const mapRows = (rows: HolderDbRow[]): Promise<TokenHolderSnapshot[]> =>
    attachHolderDisplayNames(
      rows.map((row) => ({
        address: row.address,
        tokenBalance: row.token_balance,
        totalBoughtBnb: row.total_bought_zug,
        totalSoldBnb: row.total_sold_zug,
        realizedPnlBnb: row.realized_pnl_zug,
        remainingCostBasisBnb: row.remaining_cost_basis_zug,
        remainingCostBasisUsd: row.remaining_cost_basis_usd,
        realizedPnlUsd: row.realized_pnl_usd,
        heldSince: row.held_since ? row.held_since.toISOString() : null,
      }))
    );

  try {
    const result = await db.query<HolderDbRow>(
      `
      SELECT
        p.address,
        p.token_balance::text,
        p.total_bought_zug::text,
        p.total_sold_zug::text,
        p.realized_pnl_zug::text,
        COALESCE(p.remaining_cost_basis_zug, 0)::text AS remaining_cost_basis_zug,
        COALESCE(p.remaining_cost_basis_usd, 0)::text AS remaining_cost_basis_usd,
        COALESCE(p.realized_pnl_usd, 0)::text AS realized_pnl_usd,
        lots.held_since
      FROM user_positions p
      LEFT JOIN LATERAL (
        SELECT MIN(l.opened_at) AS held_since
        FROM user_position_lots l
        WHERE l.address = p.address
          AND l.token_address = p.token_address
          AND l.closed_at IS NULL
      ) lots ON true
      WHERE p.token_address = $1
        AND p.token_balance > 0
      ORDER BY p.token_balance DESC
      LIMIT $2 OFFSET $3
      `,
      [normalized, limit, offset]
    );
    return mapRows(result.rows);
  } catch {
    // user_position_lots may be missing before migration 042 — still return balances.
    const result = await db.query<HolderDbRow>(
      `
      SELECT
        p.address,
        p.token_balance::text,
        p.total_bought_zug::text,
        p.total_sold_zug::text,
        p.realized_pnl_zug::text,
        COALESCE(p.remaining_cost_basis_zug, 0)::text AS remaining_cost_basis_zug,
        COALESCE(p.remaining_cost_basis_usd, 0)::text AS remaining_cost_basis_usd,
        COALESCE(p.realized_pnl_usd, 0)::text AS realized_pnl_usd
      FROM user_positions p
      WHERE p.token_address = $1
        AND p.token_balance > 0
      ORDER BY p.token_balance DESC
      LIMIT $2 OFFSET $3
      `,
      [normalized, limit, offset]
    );
    return mapRows(result.rows);
  }
}

export async function countTokenHolders(tokenAddress: string): Promise<number> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM user_positions p
    WHERE p.token_address = $1
      AND p.token_balance > 0
    `,
    [tokenAddress.toLowerCase()]
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** All bonding trades for chart (ascending time). */
export async function listTradesForChart(address: string, limit = 5000): Promise<TradeItem[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{
    id: string;
    side: string;
    trader_address: string;
    zug_amount: string;
    fee_zug: string;
    token_amount: string;
    price_zug: string;
    spot_price_zug: string | null;
    native_usd_rate: string | null;
    tx_hash: string;
    block_time: Date;
  }>(
    `
    SELECT
      recent.id::text,
      recent.side,
      recent.trader_address,
      recent.zug_amount::text,
      recent.fee_zug::text,
      recent.token_amount::text,
      recent.price_zug::text,
      recent.spot_price_zug::text,
      recent.native_usd_rate::text,
      recent.tx_hash,
      recent.block_time
    FROM (
      SELECT
        id,
        side,
        trader_address,
        zug_amount,
        fee_zug,
        token_amount,
        price_zug,
        spot_price_zug,
        native_usd_rate,
        tx_hash,
        block_time,
        block_number,
        log_index
      FROM trades
      WHERE token_address = $1
      ORDER BY block_number DESC, log_index DESC
      LIMIT $2
    ) recent
    ORDER BY recent.block_time ASC, recent.block_number ASC, recent.log_index ASC
    `,
    [address.toLowerCase(), limit]
  );

  return result.rows.map((row) => {
    const gross = Number(row.zug_amount);
    const fee = Number(row.fee_zug);
    const net = Math.max(0, gross - fee);
    return {
      id: row.id,
      side: row.side,
      traderAddress: row.trader_address,
      nativeAmount: row.zug_amount,
      feeBnb: row.fee_zug,
      netBnb: String(net),
      tokenAmount: row.token_amount,
      priceBnb: row.price_zug,
      spotPriceBnb: row.spot_price_zug ?? undefined,
      nativeUsdRate: row.native_usd_rate ?? undefined,
      txHash: row.tx_hash,
      blockTime: row.block_time.toISOString(),
    };
  });
}

export type StoredTokenCandleRow = {
  bucketSec: number;
  openZug: string;
  highZug: string;
  lowZug: string;
  closeZug: string;
  volumeZug: string;
  buyVolumeZug: string;
  tradeCount: number;
};

/** Pre-aggregated spot candles (descending bucket query, returned ascending). */
export async function listTokenCandlesFromDb(
  address: string,
  interval: string,
  limit = 1000
): Promise<StoredTokenCandleRow[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{
    bucket_sec: string;
    open_zug: string;
    high_zug: string;
    low_zug: string;
    close_zug: string;
    volume_zug: string;
    buy_volume_zug: string;
    trade_count: number;
  }>(
    `
    SELECT
      EXTRACT(EPOCH FROM bucket_ts)::bigint::text AS bucket_sec,
      open_zug::text,
      high_zug::text,
      low_zug::text,
      close_zug::text,
      volume_zug::text,
      buy_volume_zug::text,
      trade_count
    FROM token_candles
    WHERE token_address = $1
      AND candle_interval = $2
    ORDER BY bucket_ts DESC
    LIMIT $3
    `,
    [address.toLowerCase(), interval, limit]
  );

  return result.rows
    .map((row) => ({
      bucketSec: Number(row.bucket_sec),
      openZug: row.open_zug,
      highZug: row.high_zug,
      lowZug: row.low_zug,
      closeZug: row.close_zug,
      volumeZug: row.volume_zug,
      buyVolumeZug: row.buy_volume_zug,
      tradeCount: row.trade_count,
    }))
    .reverse();
}

/** Gap-filled candles via `gap_fill_candles` SQL (migration 026). */
export async function listTokenCandlesGapFilledFromDb(
  address: string,
  interval: string,
  limit = 1000
): Promise<StoredTokenCandleRow[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{
    bucket_sec: string;
    open_zug: string;
    high_zug: string;
    low_zug: string;
    close_zug: string;
    volume_zug: string;
    buy_volume_zug: string;
    trade_count: number;
  }>(
    `
    SELECT
      bucket_sec::text,
      open_zug::text,
      high_zug::text,
      low_zug::text,
      close_zug::text,
      volume_zug::text,
      buy_volume_zug::text,
      trade_count
    FROM gap_fill_candles($1, $2, $3, now())
    `,
    [address.toLowerCase(), interval, limit]
  );

  return result.rows.map((row) => ({
    bucketSec: Number(row.bucket_sec),
    openZug: row.open_zug,
    highZug: row.high_zug,
    lowZug: row.low_zug,
    closeZug: row.close_zug,
    volumeZug: row.volume_zug,
    buyVolumeZug: row.buy_volume_zug,
    tradeCount: row.trade_count,
  }));
}

let gapFillSqlAvailable: boolean | null = null;

/** Probe once whether migration 026 function exists. */
export async function isGapFillCandlesSqlAvailable(): Promise<boolean> {
  if (gapFillSqlAvailable != null) return gapFillSqlAvailable;
  const db = getLaunchpadReadPool();
  try {
    const result = await db.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'gap_fill_candles'
      ) AS exists
      `
    );
    gapFillSqlAvailable = Boolean(result.rows[0]?.exists);
  } catch {
    gapFillSqlAvailable = false;
  }
  return gapFillSqlAvailable;
}

export async function getUserVolumeBnb(address: string): Promise<number> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ total_volume_zug: string | null }>(
    "SELECT total_volume_zug::text FROM user_volumes WHERE address = $1",
    [address.toLowerCase()]
  );

  return Number(result.rows[0]?.total_volume_zug ?? 0);
}

export const FIRST_SMART_BUY_MIN_BNB = 0.01;

export type FirstSmartBuyTrade = {
  eventId: string;
  txHash: string;
  blockTime: string;
  tokenAddress: string;
  zugAmountBnb: number;
};

/** Earliest qualifying buy on another creator's token (≥ 0.01 BNB). */
export async function getFirstSmartBuyQualifyingTrade(
  traderAddress: string
): Promise<FirstSmartBuyTrade | null> {
  const db = getLaunchpadReadPool();
  const normalized = traderAddress.toLowerCase();

  const result = await db.query<{
    event_id: string;
    tx_hash: string;
    block_time: Date;
    token_address: string;
    zug_amount: string;
  }>(
    `
      SELECT
        tr.event_id,
        tr.tx_hash,
        tr.block_time,
        tr.token_address,
        tr.zug_amount::text
      FROM trades tr
      INNER JOIN tokens tok ON tok.address = tr.token_address
      WHERE tr.trader_address = $1
        AND tr.side = 'BUY'
        AND tr.zug_amount >= $2
        AND tok.creator_address <> tr.trader_address
      ORDER BY tr.block_time ASC, tr.block_number ASC, tr.log_index ASC
      LIMIT 1
    `,
    [normalized, FIRST_SMART_BUY_MIN_BNB]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    eventId: row.event_id,
    txHash: row.tx_hash,
    blockTime: row.block_time.toISOString(),
    tokenAddress: row.token_address,
    zugAmountBnb: Number(row.zug_amount),
  };
}

export type PortfolioPosition = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  status: string;
  tokenBalance: string;
  totalBoughtBnb: string;
  totalSoldBnb: string;
  realizedPnlBnb: string;
  remainingCostBasisBnb: string;
  remainingCostBasisUsd: string;
  realizedPnlUsd: string;
  lastPriceBnb: string;
  progressBps: number;
  estimatedValueBnb: number;
};

export type PortfolioSnapshot = {
  address: string;
  username: string | null;
  totalVolumeBnb: number;
  buyVolumeBnb: number;
  sellVolumeBnb: number;
  lastTradeAt: string | null;
  /** Sum of on-chain claimCreatorFees recorded in DB. */
  creatorFeesClaimedBnb: number;
  followingCount: number;
  followerCount: number;
  positions: PortfolioPosition[];
  createdTokens: TokenListItem[];
  createdTokensTotal: number;
};

export type CreatorFollowListEntry = {
  address: string;
  displayUsername?: string;
  followedAt: string;
  latestTokenAddress: string | null;
};

export type CreatorFollowNetwork = {
  followingCount: number;
  followerCount: number;
  following: CreatorFollowListEntry[];
  followers: CreatorFollowListEntry[];
};

export type CreatorFeeClaimRow = {
  amountBnb: string;
  txHash: string;
  blockTime: string;
};

export async function getCreatorFeesClaimedBnb(address: string): Promise<number> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ total: string | null }>(
    `
    SELECT COALESCE(SUM(amount_bnb), 0)::text AS total
    FROM creator_fee_claims
    WHERE creator_address = $1
    `,
    [address.toLowerCase()]
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function listCreatorFeeClaims(
  address: string,
  limit = 20
): Promise<CreatorFeeClaimRow[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{
    amount_bnb: string;
    tx_hash: string;
    block_time: Date;
  }>(
    `
    SELECT amount_bnb::text, tx_hash, block_time
    FROM creator_fee_claims
    WHERE creator_address = $1
    ORDER BY block_time DESC
    LIMIT $2
    `,
    [address.toLowerCase(), limit]
  );

  return result.rows.map((row) => ({
    amountBnb: row.amount_bnb,
    txHash: row.tx_hash,
    blockTime: row.block_time.toISOString(),
  }));
}

export async function recordCreatorFeeClaim(input: {
  creatorAddress: string;
  amountBnb: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  blockTime: Date;
}): Promise<void> {
  const db = getLaunchpadWritePool();
  await db.query(
    `
      INSERT INTO creator_fee_claims (
      creator_address,
      amount_bnb,
      tx_hash,
      log_index,
      block_number,
      block_time
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tx_hash, log_index) DO NOTHING
    `,
    [
      input.creatorAddress.toLowerCase(),
      input.amountBnb,
      input.txHash.toLowerCase(),
      input.logIndex,
      input.blockNumber,
      input.blockTime,
    ]
  );
}

export type ReferralStats = {
  inviteCount: number;
  referralVolumeBnb: number;
  referralFeesEarnedBnb: number;
  claimedBnb: number;
};

export async function getReferralStats(address: string): Promise<ReferralStats> {
  const db = getLaunchpadReadPool();
  const normalized = address.toLowerCase();

  const rollup = await db.query<{
    qualified_invite_count: number;
    network_volume_zug: string;
    network_fee_earned_zug: string;
  }>(
    `
    SELECT
      qualified_invite_count,
      network_volume_zug::text,
      network_fee_earned_zug::text
    FROM referrer_network_stats
    WHERE referrer_address = $1
    `,
    [normalized]
  );

  const claimed = await db.query<{ claimed_bnb: string }>(
    `
      SELECT COALESCE(SUM(amount_bnb), 0)::text AS claimed_bnb
      FROM referrer_fee_claims
      WHERE referrer_address = $1
    `,
    [normalized]
  );

  const rollupRow = rollup.rows[0];
  if (rollupRow) {
    return {
      inviteCount: rollupRow.qualified_invite_count,
      referralVolumeBnb: Number(rollupRow.network_volume_zug ?? 0),
      referralFeesEarnedBnb: Number(rollupRow.network_fee_earned_zug ?? 0),
      claimedBnb: Number(claimed.rows[0]?.claimed_bnb ?? 0),
    };
  }

  const result = await db.query<{
    invite_count: string;
    referral_volume_bnb: string;
    referral_fees_earned_bnb: string;
    claimed_bnb: string;
  }>(
    `
    SELECT
      (SELECT COUNT(*)::text FROM referral_bindings WHERE referrer_address = $1) AS invite_count,
      (
        SELECT COALESCE(SUM(t.zug_amount), 0)::text
        FROM trades t
        INNER JOIN referral_bindings rb ON rb.invitee_address = t.trader_address
        WHERE rb.referrer_address = $1
      ) AS referral_volume_bnb,
      (
        SELECT COALESCE(SUM(t.referrer_fee_zug), 0)::text
        FROM trades t
        INNER JOIN referral_bindings rb ON rb.invitee_address = t.trader_address
        WHERE rb.referrer_address = $1
      ) AS referral_fees_earned_bnb,
      (
        SELECT COALESCE(SUM(amount_bnb), 0)::text
        FROM referrer_fee_claims
        WHERE referrer_address = $1
      ) AS claimed_bnb
    `,
    [normalized]
  );

  const row = result.rows[0];
  return {
    inviteCount: Number(row?.invite_count ?? 0),
    referralVolumeBnb: Number(row?.referral_volume_bnb ?? 0),
    referralFeesEarnedBnb: Number(row?.referral_fees_earned_bnb ?? 0),
    claimedBnb: Number(row?.claimed_bnb ?? 0),
  };
}

export async function recordReferrerFeeClaim(input: {
  referrerAddress: string;
  amountBnb: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  blockTime: Date;
}): Promise<void> {
  const db = getLaunchpadWritePool();
  await db.query(
    `
      INSERT INTO referrer_fee_claims (
      referrer_address,
      amount_bnb,
      tx_hash,
      log_index,
      block_number,
      block_time
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tx_hash, log_index) DO NOTHING
    `,
    [
      input.referrerAddress.toLowerCase(),
      input.amountBnb,
      input.txHash.toLowerCase(),
      input.logIndex,
      input.blockNumber,
      input.blockTime,
    ]
  );
}

/** @deprecated Use getCreatorFeesClaimedBnb — trade fees ≠ claimable balance. */
export async function getCreatorFeesAccruedBnb(address: string): Promise<number> {
  return getCreatorFeesClaimedBnb(address);
}

export type LaunchpadTokenWalletCatalogEntry = {
  address: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  lastPriceBnb: string;
};

export async function listLaunchpadTokensForWalletBalance(): Promise<
  LaunchpadTokenWalletCatalogEntry[]
> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{
    address: string;
    symbol: string;
    name: string;
    logo_url: string | null;
    last_price_zug: string;
  }>(
    `
      SELECT
        t.address,
        t.symbol,
        t.name,
        t.logo_url,
        COALESCE((${SQL_BONDING_MARK_PRICE_ZUG}), 0)::text AS last_price_zug
      FROM tokens t
      LEFT JOIN bonding_states b ON b.token_address = t.address
      WHERE t.is_hidden = false
      ORDER BY t.created_at DESC
    `
  );

  return result.rows.map((row) => ({
    address: row.address,
    symbol: row.symbol,
    name: row.name,
    logoUrl: row.logo_url,
    lastPriceBnb: row.last_price_zug,
  }));
}

export async function listLaunchpadTokensByCreatorForWalletBalance(
  creatorAddress: string,
  limit?: number
): Promise<LaunchpadTokenWalletCatalogEntry[]> {
  const db = getLaunchpadReadPool();
  const normalized = creatorAddress.toLowerCase();
  const cappedLimit =
    limit != null && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;

  const result = await db.query<{
    address: string;
    symbol: string;
    name: string;
    logo_url: string | null;
    last_price_zug: string;
  }>(
    cappedLimit
      ? `
      SELECT
        t.address,
        t.symbol,
        t.name,
        t.logo_url,
        COALESCE((${SQL_BONDING_MARK_PRICE_ZUG}), 0)::text AS last_price_zug
      FROM tokens t
      LEFT JOIN bonding_states b ON b.token_address = t.address
      WHERE t.creator_address = $1
        AND t.is_hidden = false
      ORDER BY
        EXISTS (
          SELECT 1
          FROM trades tr
          WHERE tr.token_address = t.address
            AND tr.trader_address = $1
        ) DESC,
        t.created_at DESC
      LIMIT $2
    `
      : `
      SELECT
        t.address,
        t.symbol,
        t.name,
        t.logo_url,
        COALESCE((${SQL_BONDING_MARK_PRICE_ZUG}), 0)::text AS last_price_zug
      FROM tokens t
      LEFT JOIN bonding_states b ON b.token_address = t.address
      WHERE t.creator_address = $1
        AND t.is_hidden = false
      ORDER BY t.created_at DESC
    `,
    cappedLimit ? [normalized, cappedLimit] : [normalized]
  );

  return result.rows.map((row) => ({
    address: row.address,
    symbol: row.symbol,
    name: row.name,
    logoUrl: row.logo_url,
    lastPriceBnb: row.last_price_zug,
  }));
}

export async function getPortfolioForAddress(
  address: string,
  options?: { createdLimit?: number }
): Promise<PortfolioSnapshot> {
  const db = getLaunchpadReadPool();
  const normalized = address.toLowerCase();
  const createdLimit = options?.createdLimit;

  const [volumeResult, positionsResult, createdTokens, createdTokensTotal, creatorFeesClaimedBnb, followCountsResult, userResult] =
    await Promise.all([
    db.query<{
      total_volume_zug: string | null;
      buy_volume_zug: string | null;
      sell_volume_zug: string | null;
      last_trade_at: Date | null;
    }>(
      `
        SELECT
          total_volume_zug::text,
          buy_volume_zug::text,
          sell_volume_zug::text,
          last_trade_at
        FROM user_volumes
        WHERE address = $1
      `,
      [normalized]
    ),
    db.query<{
      token_address: string;
      symbol: string;
      name: string;
      logo_url: string | null;
      status: string;
      token_balance: string;
      total_bought_zug: string;
      total_sold_zug: string;
      realized_pnl_zug: string;
      remaining_cost_basis_zug: string;
      remaining_cost_basis_usd: string;
      realized_pnl_usd: string;
      reserve_zug: string;
      token_sold: string;
      last_price_zug: string;
      progress_bps: number;
    }>(
      `
        SELECT
          p.token_address,
          t.symbol,
          t.name,
          t.logo_url,
          t.status,
          p.token_balance::text,
          p.total_bought_zug::text,
          p.total_sold_zug::text,
          p.realized_pnl_zug::text,
          COALESCE(p.remaining_cost_basis_zug, 0)::text AS remaining_cost_basis_zug,
          COALESCE(p.remaining_cost_basis_usd, 0)::text AS remaining_cost_basis_usd,
          COALESCE(p.realized_pnl_usd, 0)::text AS realized_pnl_usd,
          COALESCE(b.reserve_zug, 0)::text AS reserve_zug,
          COALESCE(b.token_sold, 0)::text AS token_sold,
          COALESCE(b.last_price_zug, 0)::text AS last_price_zug,
          COALESCE(b.progress_bps, 0) AS progress_bps
        FROM user_positions p
        JOIN tokens t ON t.address = p.token_address
        LEFT JOIN bonding_states b ON b.token_address = p.token_address
        WHERE p.address = $1
          AND p.token_balance > 0
          AND t.is_hidden = false
        ORDER BY (p.token_balance * (${SQL_BONDING_MARK_PRICE_ZUG})) DESC
      `,
      [normalized]
    ),
    listTokensByCreator(normalized, createdLimit),
    countTokensByCreator(normalized),
    getCreatorFeesClaimedBnb(normalized),
    db.query<{ following_count: number; follower_count: number }>(
      `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM creator_follows
          WHERE follower_address = $1
        ) AS following_count,
        (
          SELECT COUNT(*)::int
          FROM creator_follows
          WHERE creator_address = $1
        ) AS follower_count
      `,
      [normalized]
    ),
    db.query<{ username: string | null }>(
      `SELECT username FROM users WHERE address = $1`,
      [normalized]
    ),
  ]);

  const volume = volumeResult.rows[0];

  const positions: PortfolioPosition[] = positionsResult.rows.map((row) => {
    const balance = Number(row.token_balance);
    const markPrice = resolvePositionMarkPriceBnb(
      row.reserve_zug,
      row.token_sold,
      row.last_price_zug
    );
    const price = Number(markPrice);
    return {
      tokenAddress: row.token_address,
      symbol: row.symbol,
      name: row.name,
      logoUrl: row.logo_url,
      status: row.status,
      tokenBalance: row.token_balance,
      totalBoughtBnb: row.total_bought_zug,
      totalSoldBnb: row.total_sold_zug,
      realizedPnlBnb: row.realized_pnl_zug,
      remainingCostBasisBnb: row.remaining_cost_basis_zug,
      remainingCostBasisUsd: row.remaining_cost_basis_usd,
      realizedPnlUsd: row.realized_pnl_usd,
      lastPriceBnb: markPrice,
      progressBps: row.progress_bps,
      estimatedValueBnb: balance * price,
    };
  });

  const followCounts = followCountsResult.rows[0];

  return {
    address: normalized,
    username: userResult.rows[0]?.username ?? null,
    totalVolumeBnb: Number(volume?.total_volume_zug ?? 0),
    buyVolumeBnb: Number(volume?.buy_volume_zug ?? 0),
    sellVolumeBnb: Number(volume?.sell_volume_zug ?? 0),
    lastTradeAt: volume?.last_trade_at?.toISOString() ?? null,
    creatorFeesClaimedBnb,
    followingCount: followCounts?.following_count ?? 0,
    followerCount: followCounts?.follower_count ?? 0,
    positions,
    createdTokens,
    createdTokensTotal,
  };
}

export async function getCreatorFollowNetwork(
  address: string,
  limit = 100
): Promise<CreatorFollowNetwork> {
  const db = getLaunchpadReadPool();
  const normalized = address.toLowerCase();

  const [countsResult, followingResult, followersResult] = await Promise.all([
    db.query<{ following_count: number; follower_count: number }>(
      `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM creator_follows
          WHERE follower_address = $1
        ) AS following_count,
        (
          SELECT COUNT(*)::int
          FROM creator_follows
          WHERE creator_address = $1
        ) AS follower_count
      `,
      [normalized]
    ),
    db.query<{
      address: string;
      followed_at: Date;
      latest_token_address: string | null;
    }>(
      `
      SELECT
        cf.creator_address AS address,
        cf.created_at AS followed_at,
        (
          SELECT t.address
          FROM tokens t
          WHERE t.creator_address = cf.creator_address
            AND t.is_hidden = false
          ORDER BY t.created_at DESC
          LIMIT 1
        ) AS latest_token_address
      FROM creator_follows cf
      WHERE cf.follower_address = $1
      ORDER BY cf.created_at DESC
      LIMIT $2
      `,
      [normalized, limit]
    ),
    db.query<{ address: string; followed_at: Date }>(
      `
      SELECT
        cf.follower_address AS address,
        cf.created_at AS followed_at
      FROM creator_follows cf
      WHERE cf.creator_address = $1
      ORDER BY cf.created_at DESC
      LIMIT $2
      `,
      [normalized, limit]
    ),
  ]);

  const counts = countsResult.rows[0];
  const following = await attachAddressDisplayNames(
    followingResult.rows.map((row) => ({
      address: row.address,
      followedAt: row.followed_at.toISOString(),
      latestTokenAddress: row.latest_token_address,
    })),
    true
  );
  const followers = await attachAddressDisplayNames(
    followersResult.rows.map((row) => ({
      address: row.address,
      followedAt: row.followed_at.toISOString(),
      latestTokenAddress: null,
    })),
    true
  );

  return {
    followingCount: counts?.following_count ?? 0,
    followerCount: counts?.follower_count ?? 0,
    following,
    followers,
  };
}

export async function listFavoriteTokenAddresses(userAddress: string): Promise<string[]> {
  const db = getLaunchpadReadPool();
  const normalized = normalizeUserStorageAddress(userAddress);
  const result = await db.query<{ token_address: string }>(
    `
    SELECT token_address
    FROM token_favorites
    WHERE user_address = $1
    ORDER BY created_at DESC
    `,
    [normalized]
  );

  return result.rows.map((row) => row.token_address);
}

export async function toggleTokenFavorite(
  userAddress: string,
  tokenAddress: string
): Promise<boolean> {
  const db = getLaunchpadWritePool();
  const user = normalizeUserStorageAddress(userAddress);
  const token = isSolanaChainFamily
    ? normalizeTokenAddress(tokenAddress)
    : tokenAddress.toLowerCase();

  const existing = await db.query(
    `SELECT 1 FROM token_favorites WHERE user_address = $1 AND token_address = $2`,
    [user, token]
  );

  if (existing.rows.length > 0) {
    await db.query(
      `DELETE FROM token_favorites WHERE user_address = $1 AND token_address = $2`,
      [user, token]
    );
    return false;
  }

  const tokenExists = await db.query(`SELECT 1 FROM tokens WHERE address = $1`, [token]);
  if (tokenExists.rows.length === 0) {
    throw new Error("Token not found");
  }

  await db.query(
    `INSERT INTO token_favorites (user_address, token_address) VALUES ($1, $2)`,
    [user, token]
  );
  return true;
}

export type CreatorCardData = {
  creatorAddress: string;
  creatorUsername?: string | null;
  creatorDisplayUsername?: string;
  followerCount: number;
  isFollowing: boolean;
  launchTxHash: string;
};

export async function listFollowedCreatorAddresses(userAddress: string): Promise<string[]> {
  const db = getLaunchpadReadPool();
  const normalized = normalizeUserStorageAddress(userAddress);
  const result = await db.query<{ creator_address: string }>(
    `
    SELECT creator_address
    FROM creator_follows
    WHERE follower_address = $1
    ORDER BY created_at DESC
    `,
    [normalized]
  );

  return result.rows.map((row) => row.creator_address);
}

export async function toggleCreatorFollow(
  followerAddress: string,
  followeeAddress: string
): Promise<boolean> {
  const db = getLaunchpadWritePool();
  const follower = normalizeUserStorageAddress(followerAddress);
  const followee = normalizeUserStorageAddress(followeeAddress);

  if (follower === followee) {
    throw new Error("Cannot follow yourself");
  }

  await ensureLaunchpadUser(db, follower);

  const existing = await db.query(
    `SELECT 1 FROM creator_follows WHERE follower_address = $1 AND creator_address = $2`,
    [follower, followee]
  );

  if (existing.rows.length > 0) {
    await db.query(
      `DELETE FROM creator_follows WHERE follower_address = $1 AND creator_address = $2`,
      [follower, followee]
    );
    return false;
  }

  await assertFollowableUser(db, followee);

  await db.query(
    `INSERT INTO creator_follows (follower_address, creator_address) VALUES ($1, $2)`,
    [follower, followee]
  );
  return true;
}

async function ensureLaunchpadUser(
  db: ReturnType<typeof getLaunchpadWritePool>,
  address: string
): Promise<void> {
  await db.query(`SELECT launchpad_ensure_user($1)`, [address]);
}

/** Any registered user or platform participant (trader, holder, creator) may be followed. */
async function assertFollowableUser(
  db: ReturnType<typeof getLaunchpadWritePool>,
  targetAddress: string
): Promise<void> {
  const registered = await db.query(`SELECT 1 FROM users WHERE address = $1`, [targetAddress]);
  if (registered.rows.length > 0) return;

  const footprint = await db.query(
    `
    SELECT 1 AS ok FROM (
      SELECT 1 FROM tokens WHERE creator_address = $1
      UNION ALL
      SELECT 1 FROM trades WHERE trader_address = $1
      UNION ALL
      SELECT 1 FROM user_positions WHERE address = $1
    ) s
    LIMIT 1
    `,
    [targetAddress]
  );

  if (footprint.rows.length === 0) {
    throw new Error("User not found");
  }

  await ensureLaunchpadUser(db, targetAddress);
}

export async function getCreatorCardData(
  tokenAddress: string,
  viewerAddress?: string | null
): Promise<CreatorCardData | null> {
  const db = getLaunchpadReadPool();
  const token = tokenAddress.toLowerCase();
  const viewer = viewerAddress?.toLowerCase() ?? null;

  const result = await db.query<{
    creator_address: string;
    follower_count: string;
    is_following: boolean;
    launch_tx_hash: string;
  }>(
    `
    SELECT
      t.creator_address,
      (
        SELECT COUNT(*)::text
        FROM creator_follows cf
        WHERE cf.creator_address = t.creator_address
      ) AS follower_count,
      CASE
        WHEN $2::text IS NOT NULL THEN EXISTS (
          SELECT 1
          FROM creator_follows cf
          WHERE cf.follower_address = $2
            AND cf.creator_address = t.creator_address
        )
        ELSE false
      END AS is_following,
      t.launch_tx_hash
    FROM tokens t
    WHERE t.address = $1 AND t.is_hidden = false
    `,
    [token, viewer]
  );

  const row = result.rows[0];
  if (!row) return null;

  const creatorUsername = await getUserUsername(row.creator_address);

  return {
    creatorAddress: row.creator_address,
    creatorUsername,
    creatorDisplayUsername: resolveDisplayUsername(row.creator_address, creatorUsername, true),
    followerCount: Number(row.follower_count),
    isFollowing: row.is_following,
    launchTxHash: row.launch_tx_hash,
  };
}

export type CreatorProfileToken = {
  address: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  status: string;
  createdAt: string;
  progressBps: number;
  marketCapBnb: string;
  lastPriceBnb: string;
  tradeCount: number;
  creatorTokenBalance: string;
};

export type CreatorProfileHolding = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  lastPriceBnb: string;
};

export type CreatorProfile = {
  address: string;
  username: string | null;
  displayUsername: string;
  followerCount: number;
  followingCount: number;
  totalVolumeBnb: number;
  creatorFeesClaimedBnb: number;
  createdTokens: CreatorProfileToken[];
  otherHoldings: CreatorProfileHolding[];
};

export async function getCreatorProfile(address: string): Promise<CreatorProfile> {
  const db = getLaunchpadReadPool();
  const normalized = address.toLowerCase();

  const [countsResult, volumeResult, createdResult, otherHoldingsResult, creatorFeesClaimedBnb] =
    await Promise.all([
      db.query<{ following_count: number; follower_count: number }>(
        `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM creator_follows
            WHERE follower_address = $1
          ) AS following_count,
          (
            SELECT COUNT(*)::int
            FROM creator_follows
            WHERE creator_address = $1
          ) AS follower_count
        `,
        [normalized]
      ),
      db.query<{ total_volume_zug: string | null }>(
        `SELECT total_volume_zug::text FROM user_volumes WHERE address = $1`,
        [normalized]
      ),
      db.query<{
        address: string;
        symbol: string;
        name: string;
        logo_url: string | null;
        status: string;
        created_at: Date;
        progress_bps: number;
        market_cap_zug: string;
        last_price_zug: string;
        trade_count: number;
        creator_token_balance: string;
      }>(
        `
        SELECT
          t.address,
          t.symbol,
          t.name,
          t.logo_url,
          t.status,
          t.created_at,
          COALESCE(b.progress_bps, 0) AS progress_bps,
          COALESCE(b.market_cap_zug, 0)::text AS market_cap_zug,
          COALESCE(b.last_price_zug, 0)::text AS last_price_zug,
          COALESCE(b.trade_count, 0) AS trade_count,
          COALESCE(p.token_balance, 0)::text AS creator_token_balance
        FROM tokens t
        LEFT JOIN bonding_states b ON b.token_address = t.address
        LEFT JOIN user_positions p
          ON p.token_address = t.address
          AND p.address = t.creator_address
        WHERE t.creator_address = $1
          AND t.is_hidden = false
        ORDER BY t.created_at DESC
        `,
        [normalized]
      ),
      db.query<{
        token_address: string;
        symbol: string;
        name: string;
        logo_url: string | null;
        token_balance: string;
        last_price_zug: string;
      }>(
        `
        SELECT
          p.token_address,
          t.symbol,
          t.name,
          t.logo_url,
          p.token_balance::text,
          COALESCE(b.last_price_zug, 0)::text AS last_price_zug
        FROM user_positions p
        JOIN tokens t ON t.address = p.token_address
        LEFT JOIN bonding_states b ON b.token_address = p.token_address
        WHERE p.address = $1
          AND p.token_balance > 0
          AND t.creator_address <> $1
          AND t.is_hidden = false
        ORDER BY (p.token_balance * COALESCE(b.last_price_zug, 0)) DESC
        `,
        [normalized]
      ),
      getCreatorFeesClaimedBnb(normalized),
    ]);

  const counts = countsResult.rows[0];
  const username = await getUserUsername(normalized);

  return {
    address: normalized,
    username,
    displayUsername: resolveDisplayUsername(normalized, username),
    followerCount: counts?.follower_count ?? 0,
    followingCount: counts?.following_count ?? 0,
    totalVolumeBnb: Number(volumeResult.rows[0]?.total_volume_zug ?? 0),
    creatorFeesClaimedBnb,
    createdTokens: createdResult.rows.map((row) => ({
      address: row.address,
      symbol: row.symbol,
      name: row.name,
      logoUrl: row.logo_url,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      progressBps: row.progress_bps,
      marketCapBnb: row.market_cap_zug,
      lastPriceBnb: row.last_price_zug,
      tradeCount: row.trade_count,
      creatorTokenBalance: row.creator_token_balance,
    })),
    otherHoldings: otherHoldingsResult.rows.map((row) => ({
      tokenAddress: row.token_address,
      symbol: row.symbol,
      name: row.name,
      logoUrl: row.logo_url,
      tokenBalance: row.token_balance,
      lastPriceBnb: row.last_price_zug,
    })),
  };
}
