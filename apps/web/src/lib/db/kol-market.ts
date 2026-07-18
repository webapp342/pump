import { getLaunchpadReadPool, getLaunchpadWritePool } from "@/lib/db/pool";
import { attachAddressDisplayNames } from "@/lib/user-display";
import { resolveDisplayUsername } from "@/lib/username";
import { fetchTokenMcapSnapshot } from "@/lib/db/token-announcements";
import { dispatchFollowerAnnouncementPush } from "@/lib/push/dispatch-announcement";
import { releaseKolEscrowOnAccept } from "@/lib/kol-market-escrow-server";
import type { TokenAnnouncementRow } from "@/lib/token-announcements-shared";

export type KolTier = "standard" | "verified";

export type KolExploreRow = {
  address: string;
  displayUsername: string | null;
  minPriceUsd: number;
  isActive: boolean;
  kolTier: KolTier;
  followerCount: number;
  calloutCount: number;
  medianCalloutMultiplier: number;
  avgCalloutMultiplier: number;
  calloutHitRate: number;
  acceptRate: number;
  avgHoldSeconds: number;
  networkVolumeBnb: number;
  avgVolumePerInvitee: number;
  repeatTraderRate: number;
  peakTokenMultiplier: number;
};

export type KolProfileDetail = KolExploreRow & {
  bio: string | null;
  sponsoredCalloutCount: number;
  requestsReceived: number;
  requestsAccepted: number;
  avgResponseMinutes: number | null;
};

export type KolUserStats = {
  tradeCount: number;
  totalVolumeZug: number;
  networkVolumeZug: number;
  avgVolumePerInvitee: number;
  repeatTraderRate: number;
  avgHoldSeconds: number;
  peakTokenMultiplier: number;
  qualifiedInviteCount: number;
};

export type KolCalloutRequestRow = {
  id: string;
  sponsorAddress: string;
  kolAddress: string;
  tokenAddress: string;
  priceUsd: number;
  escrowAmountZug: number;
  escrowTxHash: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  tokenSymbol?: string | null;
  tokenName?: string | null;
};

const VERIFIED_THRESHOLDS = {
  qualifiedInvites: 5,
  networkVolumeBnb: 1,
  avgVolumePerInviteeBnb: 0.05,
  repeatTraderRate: 0.2,
  medianCalloutMultiplier: 1.5,
  calloutCount: 3,
} as const;

const REQUEST_TTL_HOURS = 72;

function mapExploreRow(row: Record<string, unknown>): Omit<KolExploreRow, "displayUsername"> {
  return {
    address: String(row.address),
    minPriceUsd: Number(row.min_price_usd ?? 10),
    isActive: Boolean(row.is_active),
    kolTier: (row.kol_tier === "verified" ? "verified" : "standard") as KolTier,
    followerCount: Number(row.follower_count ?? 0),
    calloutCount: Number(row.callout_count ?? 0),
    medianCalloutMultiplier: Number(row.median_callout_multiplier ?? 0),
    avgCalloutMultiplier: Number(row.avg_callout_multiplier ?? 0),
    calloutHitRate: Number(row.callout_hit_rate ?? 0),
    acceptRate: Number(row.accept_rate ?? 0),
    avgHoldSeconds: Number(row.avg_hold_seconds ?? 0),
    networkVolumeBnb: Number(row.network_volume_zug ?? 0),
    avgVolumePerInvitee: Number(row.avg_volume_per_invitee ?? 0),
    repeatTraderRate: Number(row.repeat_trader_rate ?? 0),
    peakTokenMultiplier: Number(row.peak_token_multiplier ?? 0),
  };
}

export async function listKolMarketExplore(limit = 24): Promise<KolExploreRow[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query(
    `
    SELECT
      kp.address,
      kp.min_price_usd,
      kp.is_active,
      kp.kol_tier,
      kp.callout_count,
      kp.median_callout_multiplier,
      kp.avg_callout_multiplier,
      kp.callout_hit_rate,
      kp.accept_rate,
      COALESCE(hs.avg_hold_seconds, 0) AS avg_hold_seconds,
      COALESCE(rns.network_volume_zug, 0) AS network_volume_zug,
      COALESCE(rns.avg_volume_per_invitee, 0) AS avg_volume_per_invitee,
      COALESCE(rns.repeat_trader_rate, 0) AS repeat_trader_rate,
      COALESCE(
        (
          SELECT MAX(tbs.peak_multiplier_x)
          FROM tokens t
          INNER JOIN token_board_stats tbs ON tbs.token_address = t.address
          WHERE lower(t.creator_address) = kp.address
        ),
        0
      ) AS peak_token_multiplier,
      (
        SELECT COUNT(*)::integer
        FROM creator_follows cf
        WHERE cf.creator_address = kp.address
      ) AS follower_count
    FROM kol_profiles kp
    LEFT JOIN user_hold_stats hs ON hs.address = kp.address
    LEFT JOIN referrer_network_stats rns ON rns.referrer_address = kp.address
    WHERE kp.is_active = true
    ORDER BY follower_count DESC, kp.callout_count DESC, kp.updated_at DESC
    LIMIT $1
    `,
    [limit]
  );

  const rows = result.rows.map((row) => mapExploreRow(row as Record<string, unknown>));
  const named = await attachAddressDisplayNames(rows.map((r) => ({ address: r.address })));
  return rows.map((row, i) => ({
    ...row,
    displayUsername:
      named[i]?.displayUsername ?? resolveDisplayUsername(row.address, null),
  }));
}

export async function getKolProfileDetail(address: string): Promise<KolProfileDetail | null> {
  const db = getLaunchpadReadPool();
  const normalized = address.toLowerCase();
  const result = await db.query(
    `
    SELECT
      kp.*,
      COALESCE(hs.avg_hold_seconds, 0) AS avg_hold_seconds,
      COALESCE(rns.network_volume_zug, 0) AS network_volume_zug,
      COALESCE(rns.avg_volume_per_invitee, 0) AS avg_volume_per_invitee,
      COALESCE(rns.repeat_trader_rate, 0) AS repeat_trader_rate,
      COALESCE(
        (
          SELECT MAX(tbs.peak_multiplier_x)
          FROM tokens t
          INNER JOIN token_board_stats tbs ON tbs.token_address = t.address
          WHERE lower(t.creator_address) = kp.address
        ),
        0
      ) AS peak_token_multiplier,
      (
        SELECT COUNT(*)::integer
        FROM creator_follows cf
        WHERE cf.creator_address = kp.address
      ) AS follower_count
    FROM kol_profiles kp
    LEFT JOIN user_hold_stats hs ON hs.address = kp.address
    LEFT JOIN referrer_network_stats rns ON rns.referrer_address = kp.address
    WHERE kp.address = $1
    `,
    [normalized]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const base = mapExploreRow(row);
  const named = await attachAddressDisplayNames([{ address: base.address }]);

  return {
    ...base,
    displayUsername:
      named[0]?.displayUsername ?? resolveDisplayUsername(base.address, null),
    bio: row.bio != null ? String(row.bio) : null,
    sponsoredCalloutCount: Number(row.sponsored_callout_count ?? 0),
    requestsReceived: Number(row.requests_received ?? 0),
    requestsAccepted: Number(row.requests_accepted ?? 0),
    avgResponseMinutes:
      row.avg_response_minutes != null ? Number(row.avg_response_minutes) : null,
  };
}

export async function upsertKolProfile(input: {
  address: string;
  minPriceUsd: number;
  isActive: boolean;
  bio?: string | null;
}): Promise<void> {
  const db = getLaunchpadWritePool();
  await db.query(
    `
    INSERT INTO kol_profiles (address, min_price_usd, is_active, bio, updated_at)
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (address) DO UPDATE SET
      min_price_usd = EXCLUDED.min_price_usd,
      is_active = EXCLUDED.is_active,
      bio = EXCLUDED.bio,
      updated_at = now()
    `,
    [input.address.toLowerCase(), input.minPriceUsd, input.isActive, input.bio ?? null]
  );
}

/** Sponsored callouts are only for tokens the sponsor launched. */
export async function assertSponsorOwnsToken(
  sponsorAddress: string,
  tokenAddress: string
): Promise<void> {
  const db = getLaunchpadReadPool();
  const result = await db.query(
    `
    SELECT 1
    FROM tokens
    WHERE address = $1
      AND creator_address = $2
      AND is_hidden = false
    LIMIT 1
    `,
    [tokenAddress.toLowerCase(), sponsorAddress.toLowerCase()]
  );
  if (!result.rows[0]) {
    throw new Error("You can only request callouts for tokens you launched");
  }
}

export async function getKolUserStats(address: string): Promise<KolUserStats> {
  const db = getLaunchpadReadPool();
  const normalized = address.toLowerCase();

  const result = await db.query(
    `
    SELECT
      COALESCE(uts.trade_count, 0) AS trade_count,
      COALESCE(uts.total_volume_zug, 0) AS total_volume_zug,
      COALESCE(rns.network_volume_zug, 0) AS network_volume_zug,
      COALESCE(rns.avg_volume_per_invitee, 0) AS avg_volume_per_invitee,
      COALESCE(rns.repeat_trader_rate, 0) AS repeat_trader_rate,
      COALESCE(rns.qualified_invite_count, 0) AS qualified_invite_count,
      COALESCE(hs.avg_hold_seconds, 0) AS avg_hold_seconds,
      COALESCE(
        (
          SELECT MAX(tbs.peak_multiplier_x)
          FROM tokens t
          INNER JOIN token_board_stats tbs ON tbs.token_address = t.address
          WHERE lower(t.creator_address) = $1
        ),
        0
      ) AS peak_token_multiplier
    FROM (SELECT $1::text AS address) seed
    LEFT JOIN user_trade_stats uts ON uts.address = seed.address
    LEFT JOIN referrer_network_stats rns ON rns.referrer_address = seed.address
    LEFT JOIN user_hold_stats hs ON hs.address = seed.address
    `,
    [normalized]
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return {
    tradeCount: Number(row?.trade_count ?? 0),
    totalVolumeZug: Number(row?.total_volume_zug ?? 0),
    networkVolumeZug: Number(row?.network_volume_zug ?? 0),
    avgVolumePerInvitee: Number(row?.avg_volume_per_invitee ?? 0),
    repeatTraderRate: Number(row?.repeat_trader_rate ?? 0),
    avgHoldSeconds: Number(row?.avg_hold_seconds ?? 0),
    peakTokenMultiplier: Number(row?.peak_token_multiplier ?? 0),
    qualifiedInviteCount: Number(row?.qualified_invite_count ?? 0),
  };
}

export async function createKolCalloutRequestDraft(input: {
  sponsorAddress: string;
  kolAddress: string;
  tokenAddress: string;
  priceUsd: number;
  escrowAmountZug: number;
}): Promise<KolCalloutRequestRow> {
  const db = getLaunchpadWritePool();
  const expiresAt = new Date(Date.now() + REQUEST_TTL_HOURS * 3600 * 1000);

  const inserted = await db.query(
    `
    INSERT INTO kol_callout_requests (
      sponsor_address,
      kol_address,
      token_address,
      price_usd,
      escrow_amount_zug,
      status,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5, 'pending', $6)
    RETURNING *
    `,
    [
      input.sponsorAddress.toLowerCase(),
      input.kolAddress.toLowerCase(),
      input.tokenAddress.toLowerCase(),
      input.priceUsd,
      input.escrowAmountZug,
      expiresAt,
    ]
  );

  return mapRequestRow(inserted.rows[0] as Record<string, unknown>);
}

export async function confirmKolCalloutRequestEscrow(input: {
  requestId: string;
  sponsorAddress: string;
  escrowTxHash: string;
}): Promise<KolCalloutRequestRow> {
  const db = getLaunchpadWritePool();
  const result = await db.query(
    `
    UPDATE kol_callout_requests
    SET escrow_tx_hash = $3,
        updated_at = now()
    WHERE id = $1::uuid
      AND sponsor_address = $2
      AND status = 'pending'
      AND escrow_tx_hash IS NULL
    RETURNING *
    `,
    [input.requestId, input.sponsorAddress.toLowerCase(), input.escrowTxHash.toLowerCase()]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("Request not found or already confirmed");

  await db.query(
    `
      UPDATE kol_profiles
      SET requests_received = requests_received + 1,
          updated_at = now()
      WHERE address = $1
    `,
    [String(row.kol_address).toLowerCase()]
  );

  return mapRequestRow(row);
}

export async function createKolCalloutRequest(input: {
  sponsorAddress: string;
  kolAddress: string;
  tokenAddress: string;
  priceUsd: number;
  escrowAmountZug: number;
  escrowTxHash: string;
}): Promise<KolCalloutRequestRow> {
  const draft = await createKolCalloutRequestDraft(input);
  return confirmKolCalloutRequestEscrow({
    requestId: draft.id,
    sponsorAddress: input.sponsorAddress,
    escrowTxHash: input.escrowTxHash,
  });
}

function mapRequestRow(row: Record<string, unknown>): KolCalloutRequestRow {
  return {
    id: String(row.id),
    sponsorAddress: String(row.sponsor_address),
    kolAddress: String(row.kol_address),
    tokenAddress: String(row.token_address),
    priceUsd: Number(row.price_usd),
    escrowAmountZug: Number(row.escrow_amount_zug),
    escrowTxHash: row.escrow_tx_hash != null ? String(row.escrow_tx_hash) : null,
    status: String(row.status),
    expiresAt: (row.expires_at as Date).toISOString(),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export async function acceptKolCalloutRequest(input: {
  requestId: string;
  kolAddress: string;
}): Promise<{ request: KolCalloutRequestRow; announcementId: string }> {
  const db = getLaunchpadWritePool();
  const kol = input.kolAddress.toLowerCase();

  const pending = await db.query(
    `
    SELECT *
    FROM kol_callout_requests
    WHERE id = $1::uuid
      AND kol_address = $2
      AND status = 'pending'
      AND expires_at > now()
    FOR UPDATE
    `,
    [input.requestId, kol]
  );
  const req = pending.rows[0] as Record<string, unknown> | undefined;
  if (!req) throw new Error("Request not found or expired");
  if (req.escrow_tx_hash == null || String(req.escrow_tx_hash).trim() === "") {
    throw new Error("Escrow payment not confirmed");
  }

  const token = String(req.token_address);
  const sponsor = String(req.sponsor_address);
  const snapshot = await fetchTokenMcapSnapshot(token);
  if (!snapshot) throw new Error("Token not found");

  const mcap = Number(snapshot.market_cap_zug);
  const launch = Number(snapshot.launch_mcap_zug);
  const multiplier = launch > 0 ? mcap / launch : 1;

  const ann = await db.query<{ id: string }>(
    `
    INSERT INTO token_announcements (
      token_address,
      announcer_address,
      market_cap_zug_at_announce,
      launch_mcap_zug,
      multiplier_x,
      token_balance_at_announce,
      token_balance_usd_at_announce,
      is_sponsored,
      sponsor_address
    ) VALUES ($1, $2, $3, $4, $5, NULL, NULL, true, $6)
    RETURNING id::text
    `,
    [token, kol, String(mcap), String(launch), String(multiplier), sponsor]
  );
  const announcementId = ann.rows[0]?.id;
  if (!announcementId) throw new Error("Failed to create sponsored callout");

  let releaseTxHash: string | null = null;
  try {
    releaseTxHash = await releaseKolEscrowOnAccept(input.requestId);
  } catch (error) {
    console.error("[kol-market] escrow release failed", error);
  }

  const acceptedAt = new Date();
  const updated = await db.query(
    `
    UPDATE kol_callout_requests
    SET status = 'accepted',
        accepted_at = $2,
        announcement_id = $3::bigint,
        release_tx_hash = COALESCE($4, release_tx_hash),
        updated_at = now()
    WHERE id = $1::uuid
    RETURNING *
    `,
    [input.requestId, acceptedAt, announcementId, releaseTxHash]
  );

  await db.query(
    `
      UPDATE kol_profiles
      SET requests_accepted = requests_accepted + 1,
          sponsored_callout_count = sponsored_callout_count + 1,
          callout_count = callout_count + 1,
          accept_rate = CASE
            WHEN requests_received > 0 THEN (requests_accepted + 1)::numeric / requests_received
            ELSE 0
          END,
          updated_at = now()
      WHERE address = $1
    `,
    [kol]
  );

  const named = await attachAddressDisplayNames([{ address: kol }]);
  const pushRow: TokenAnnouncementRow = {
    id: announcementId,
    tokenAddress: token,
    announcerAddress: kol,
    announcerDisplayUsername:
      named[0]?.displayUsername ?? resolveDisplayUsername(kol, null),
    marketCapZugAtAnnounce: String(mcap),
    launchMcapZug: String(launch),
    multiplierX: multiplier,
    tokenBalanceAtAnnounce: null,
    tokenBalanceUsdAtAnnounce: null,
    isSponsored: true,
    sponsorAddress: sponsor,
    createdAt: acceptedAt.toISOString(),
  };
  void dispatchFollowerAnnouncementPush(pushRow).catch(() => undefined);

  return {
    request: mapRequestRow(updated.rows[0] as Record<string, unknown>),
    announcementId,
  };
}

export async function rejectKolCalloutRequest(input: {
  requestId: string;
  kolAddress: string;
  reason?: string;
}): Promise<KolCalloutRequestRow> {
  const db = getLaunchpadWritePool();
  const result = await db.query(
    `
    UPDATE kol_callout_requests
    SET status = 'rejected',
        reject_reason = $3,
        updated_at = now()
    WHERE id = $1::uuid
      AND kol_address = $2
      AND status = 'pending'
    RETURNING *
    `,
    [input.requestId, input.kolAddress.toLowerCase(), input.reason ?? null]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Request not found");
  return mapRequestRow(row as Record<string, unknown>);
}

export async function listKolRequestsForKol(
  kolAddress: string,
  status?: string
): Promise<KolCalloutRequestRow[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query(
    `
    SELECT r.*, t.symbol AS token_symbol, t.name AS token_name
    FROM kol_callout_requests r
    LEFT JOIN tokens t ON t.address = r.token_address
    WHERE r.kol_address = $1
      AND ($2::text IS NULL OR r.status = $2)
    ORDER BY r.created_at DESC
    LIMIT 50
    `,
    [kolAddress.toLowerCase(), status ?? null]
  );
  return result.rows.map((row) => ({
    ...mapRequestRow(row as Record<string, unknown>),
    tokenSymbol: row.token_symbol != null ? String(row.token_symbol) : null,
    tokenName: row.token_name != null ? String(row.token_name) : null,
  }));
}

export async function evaluateVerifiedKolTier(address: string): Promise<KolTier> {
  const db = getLaunchpadWritePool();
  const normalized = address.toLowerCase();

  const result = await db.query(
    `
    SELECT
      kp.callout_count,
      kp.median_callout_multiplier,
      COALESCE(rns.qualified_invite_count, 0) AS qualified_invite_count,
      COALESCE(rns.network_volume_zug, 0) AS network_volume_zug,
      COALESCE(rns.avg_volume_per_invitee, 0) AS avg_volume_per_invitee,
      COALESCE(rns.repeat_trader_rate, 0) AS repeat_trader_rate
    FROM kol_profiles kp
    LEFT JOIN referrer_network_stats rns ON rns.referrer_address = kp.address
    WHERE kp.address = $1
    `,
    [normalized]
  );
  const row = result.rows[0];
  if (!row) return "standard";

  const qualified =
    Number(row.qualified_invite_count) >= VERIFIED_THRESHOLDS.qualifiedInvites &&
    Number(row.network_volume_zug) >= VERIFIED_THRESHOLDS.networkVolumeBnb &&
    Number(row.avg_volume_per_invitee) >= VERIFIED_THRESHOLDS.avgVolumePerInviteeBnb &&
    Number(row.repeat_trader_rate) >= VERIFIED_THRESHOLDS.repeatTraderRate &&
    Number(row.callout_count) >= VERIFIED_THRESHOLDS.calloutCount &&
    Number(row.median_callout_multiplier) >= VERIFIED_THRESHOLDS.medianCalloutMultiplier;

  const tier: KolTier = qualified ? "verified" : "standard";
  await db.query(
    `
      UPDATE kol_profiles
      SET kol_tier = $2, updated_at = now()
      WHERE address = $1 AND kol_tier IS DISTINCT FROM $2
    `,
    [normalized, tier]
  );
  return tier;
}

export { VERIFIED_THRESHOLDS, REQUEST_TTL_HOURS };
