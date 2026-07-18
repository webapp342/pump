import { getLaunchpadReadPool, getLaunchpadWritePool } from "@/lib/db/pool";
import {
  BONDING_TOKEN_SUPPLY_HUMAN,
  BONDING_VIRTUAL_BNB_HUMAN,
} from "@/lib/bonding-curve";
import { fetchLiveTokenBalance } from "@/lib/airdrop-onchain";
import { bnbToUsd } from "@/lib/format-usd";
import { fetchNativeUsdPrice } from "@/lib/native-usd-price";
import {
  ANNOUNCE_COOLDOWN_MS,
  ANNOUNCE_HOLDINGS_ERROR,
  ANNOUNCE_MIN_TOKEN_BALANCE,
  type PortfolioAnnouncementRow,
  type TokenAnnouncementRow,
} from "@/lib/token-announcements-shared";
import { attachAddressDisplayNames } from "@/lib/user-display";
import { resolveDisplayUsername } from "@/lib/username";

export {
  ANNOUNCE_COOLDOWN_MS,
  ANNOUNCE_HOLDINGS_ERROR,
  ANNOUNCE_MIN_TOKEN_BALANCE,
  formatAnnounceBalance,
  type PortfolioAnnouncementRow,
  type TokenAnnouncementRow,
} from "@/lib/token-announcements-shared";

type SnapshotRow = {
  market_cap_zug: string;
  launch_mcap_zug: string;
};

type AnnouncementDbRow = {
  id: string;
  token_address: string;
  announcer_address: string;
  market_cap_zug_at_announce: string;
  launch_mcap_zug: string;
  multiplier_x: string;
  token_balance_at_announce: string | null;
  token_balance_usd_at_announce: string | null;
  is_sponsored?: boolean | null;
  sponsor_address?: string | null;
  created_at: Date;
};

function parseOptionalNumber(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapAnnouncement(
  row: AnnouncementDbRow
): Omit<TokenAnnouncementRow, "announcerDisplayUsername"> {
  return {
    id: row.id,
    tokenAddress: row.token_address,
    announcerAddress: row.announcer_address,
    marketCapZugAtAnnounce: row.market_cap_zug_at_announce,
    launchMcapZug: row.launch_mcap_zug,
    multiplierX: Number(row.multiplier_x),
    tokenBalanceAtAnnounce: parseOptionalNumber(row.token_balance_at_announce),
    tokenBalanceUsdAtAnnounce: parseOptionalNumber(row.token_balance_usd_at_announce),
    isSponsored: Boolean(row.is_sponsored),
    sponsorAddress: row.sponsor_address ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Launch FDV from bonding virtuals (t0: sold=0).
 * price = virtualZug / virtualToken; FDV = price × supply ≈ virtualZug when virtualToken ≈ supply.
 */
export async function fetchTokenMcapSnapshot(tokenAddress: string): Promise<SnapshotRow | null> {
  const db = getLaunchpadReadPool();
  const token = tokenAddress.toLowerCase();
  const result = await db.query<SnapshotRow>(
    `
    SELECT
      COALESCE(
        b.market_cap_zug,
        (
          (COALESCE(b.virtual_zug_reserve, ${BONDING_VIRTUAL_BNB_HUMAN})::numeric
            + COALESCE(b.reserve_zug, 0))
          / NULLIF(
              COALESCE(b.virtual_token_reserve, ${BONDING_TOKEN_SUPPLY_HUMAN})::numeric
                - COALESCE(b.token_sold, 0),
              0
            )
          * ${BONDING_TOKEN_SUPPLY_HUMAN}::numeric
        ),
        0
      )::text AS market_cap_zug,
      (
        COALESCE(b.virtual_zug_reserve, ${BONDING_VIRTUAL_BNB_HUMAN})::numeric
        / NULLIF(COALESCE(b.virtual_token_reserve, ${BONDING_TOKEN_SUPPLY_HUMAN})::numeric, 0)
        * ${BONDING_TOKEN_SUPPLY_HUMAN}::numeric
      )::text AS launch_mcap_zug
    FROM tokens t
    LEFT JOIN bonding_states b ON b.token_address = t.address
    WHERE t.address = $1
    LIMIT 1
    `,
    [token]
  );
  const row = result.rows[0];
  if (!row) return null;
  return row;
}

function holdingsUsdAtAnnounce(balanceHuman: number, marketCapZug: number, nativeUsd: number | null): number | null {
  if (!Number.isFinite(balanceHuman) || balanceHuman <= 0) return null;
  if (!Number.isFinite(marketCapZug) || marketCapZug <= 0) return null;
  const priceBnb = marketCapZug / BONDING_TOKEN_SUPPLY_HUMAN;
  if (!Number.isFinite(priceBnb) || priceBnb <= 0) return null;
  return bnbToUsd(balanceHuman * priceBnb, nativeUsd);
}

export async function createTokenAnnouncement(
  announcerAddress: string,
  tokenAddress: string
): Promise<TokenAnnouncementRow> {
  const db = getLaunchpadWritePool();
  const announcer = announcerAddress.toLowerCase();
  const token = tokenAddress.toLowerCase();

  const snapshot = await fetchTokenMcapSnapshot(token);
  if (!snapshot) {
    throw new Error("Token not found");
  }

  const mcap = Number(snapshot.market_cap_zug);
  const launch = Number(snapshot.launch_mcap_zug);
  if (!Number.isFinite(mcap) || mcap <= 0) {
    throw new Error("Market cap unavailable");
  }
  if (!Number.isFinite(launch) || launch <= 0) {
    throw new Error("Launch market cap unavailable");
  }

  const balanceHuman = Number(await fetchLiveTokenBalance(token, announcer));
  if (!Number.isFinite(balanceHuman) || balanceHuman < ANNOUNCE_MIN_TOKEN_BALANCE) {
    throw new Error(ANNOUNCE_HOLDINGS_ERROR);
  }

  const recent = await db.query<{ created_at: Date }>(
    `
    SELECT created_at
    FROM token_announcements
    WHERE announcer_address = $1 AND token_address = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [announcer, token]
  );
  const lastAt = recent.rows[0]?.created_at;
  if (lastAt && Date.now() - lastAt.getTime() < ANNOUNCE_COOLDOWN_MS) {
    throw new Error("Please wait a few minutes before announcing again");
  }

  const nativePrice = await fetchNativeUsdPrice();
  const balanceUsd = holdingsUsdAtAnnounce(balanceHuman, mcap, nativePrice.nativeUsd);

  const multiplier = mcap / launch;
  const inserted = await db.query<AnnouncementDbRow>(
    `
    INSERT INTO token_announcements (
      token_address,
      announcer_address,
      market_cap_zug_at_announce,
      launch_mcap_zug,
      multiplier_x,
      token_balance_at_announce,
      token_balance_usd_at_announce
    )
    VALUES ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7::numeric)
    RETURNING
      id::text,
      token_address,
      announcer_address,
      market_cap_zug_at_announce::text,
      launch_mcap_zug::text,
      multiplier_x::text,
      token_balance_at_announce::text,
      token_balance_usd_at_announce::text,
      created_at
    `,
    [
      token,
      announcer,
      String(mcap),
      String(launch),
      String(multiplier),
      String(balanceHuman),
      balanceUsd != null ? String(balanceUsd) : null,
    ]
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Error("Failed to create announcement");
  }

  const named = await attachAddressDisplayNames([{ address: row.announcer_address }]);

  return {
    ...mapAnnouncement(row),
    announcerDisplayUsername:
      named[0]?.displayUsername ?? resolveDisplayUsername(row.announcer_address, null),
  };
}

const ANNOUNCEMENT_SELECT_COLS = `
  id::text,
  token_address,
  announcer_address,
  market_cap_zug_at_announce::text,
  launch_mcap_zug::text,
  multiplier_x::text,
  token_balance_at_announce::text,
  token_balance_usd_at_announce::text,
  is_sponsored,
  sponsor_address,
  created_at
`;

export async function listTokenAnnouncements(
  tokenAddress: string,
  limit = 40
): Promise<TokenAnnouncementRow[]> {
  const db = getLaunchpadReadPool();
  const token = tokenAddress.toLowerCase();
  const capped = Math.min(Math.max(limit, 1), 100);

  const result = await db.query<AnnouncementDbRow>(
    `
    SELECT ${ANNOUNCEMENT_SELECT_COLS}
    FROM token_announcements
    WHERE token_address = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [token, capped]
  );

  if (result.rows.length === 0) return [];

  const named = await attachAddressDisplayNames(
    result.rows.map((row) => ({
      address: row.announcer_address,
    }))
  );
  const nameByAddress = new Map(named.map((n) => [n.address.toLowerCase(), n.displayUsername]));

  return result.rows.map((row) => ({
    ...mapAnnouncement(row),
    announcerDisplayUsername:
      nameByAddress.get(row.announcer_address) ??
      resolveDisplayUsername(row.announcer_address, null),
  }));
}

export async function listAnnouncementsByUser(
  announcerAddress: string,
  limit = 50
): Promise<PortfolioAnnouncementRow[]> {
  const db = getLaunchpadReadPool();
  const announcer = announcerAddress.toLowerCase();
  const capped = Math.min(Math.max(limit, 1), 100);

  const result = await db.query<
    AnnouncementDbRow & {
      symbol: string;
      name: string;
      logo_url: string | null;
    }
  >(
    `
    SELECT
      a.id::text,
      a.token_address,
      a.announcer_address,
      a.market_cap_zug_at_announce::text,
      a.launch_mcap_zug::text,
      a.multiplier_x::text,
      a.token_balance_at_announce::text,
      a.token_balance_usd_at_announce::text,
      a.is_sponsored,
      a.sponsor_address,
      a.created_at,
      t.symbol,
      t.name,
      t.logo_url
    FROM token_announcements a
    JOIN tokens t ON t.address = a.token_address
    WHERE a.announcer_address = $1
    ORDER BY a.created_at DESC
    LIMIT $2
    `,
    [announcer, capped]
  );

  return result.rows.map((row) => ({
    ...mapAnnouncement(row),
    announcerDisplayUsername: resolveDisplayUsername(row.announcer_address, null),
    tokenSymbol: row.symbol,
    tokenName: row.name,
    tokenLogoUrl: row.logo_url,
  }));
}
