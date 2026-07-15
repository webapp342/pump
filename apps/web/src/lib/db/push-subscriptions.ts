import type { PushPreferences, PushDisplayMode, PushPlatform, PushSubscriptionPayload } from "@/lib/push/types";
import { hashUserAgent } from "@/lib/push/validate-subscription";
import { getLaunchpadPool } from "@/lib/db/launchpad";

export type PushSubscriptionRow = {
  id: number;
  user_address: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  platform: PushPlatform;
  display_mode: PushDisplayMode;
  user_agent_hash: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  last_error_at: string | null;
  last_error_code: number | null;
};

export type PushSubscriptionRecord = {
  id: number;
  userAddress: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  platform: PushPlatform;
  displayMode: PushDisplayMode;
  enabled: boolean;
};

function mapRow(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userAddress: row.user_address,
    endpoint: row.endpoint,
    p256dhKey: row.p256dh_key,
    authKey: row.auth_key,
    platform: row.platform,
    displayMode: row.display_mode,
    enabled: row.enabled,
  };
}

export async function upsertPushSubscription(input: {
  userAddress: string;
  subscription: PushSubscriptionPayload;
  platform: PushPlatform;
  displayMode: PushDisplayMode;
  userAgent?: string | null;
}): Promise<PushSubscriptionRecord> {
  const db = getLaunchpadPool();
  const address = input.userAddress.toLowerCase();

  await db.query(
    `
    INSERT INTO users (address, last_active)
    VALUES ($1, now())
    ON CONFLICT (address) DO UPDATE SET last_active = EXCLUDED.last_active
    `,
    [address]
  );

  const result = await db.query<PushSubscriptionRow>(
    `
    INSERT INTO push_subscriptions (
      user_address,
      endpoint,
      p256dh_key,
      auth_key,
      platform,
      display_mode,
      user_agent_hash,
      enabled,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
    ON CONFLICT (endpoint) DO UPDATE SET
      user_address = EXCLUDED.user_address,
      p256dh_key = EXCLUDED.p256dh_key,
      auth_key = EXCLUDED.auth_key,
      platform = EXCLUDED.platform,
      display_mode = EXCLUDED.display_mode,
      user_agent_hash = EXCLUDED.user_agent_hash,
      enabled = true,
      updated_at = now(),
      last_error_at = NULL,
      last_error_code = NULL
    RETURNING *
    `,
    [
      address,
      input.subscription.endpoint,
      input.subscription.keys.p256dh,
      input.subscription.keys.auth,
      input.platform,
      input.displayMode,
      hashUserAgent(input.userAgent),
    ]
  );

  await db.query(
    `
    INSERT INTO push_preferences (user_address)
    VALUES ($1)
    ON CONFLICT (user_address) DO NOTHING
    `,
    [address]
  );

  return mapRow(result.rows[0]!);
}

export async function deletePushSubscriptionForUser(
  userAddress: string,
  endpoint: string
): Promise<boolean> {
  const db = getLaunchpadPool();
  const result = await db.query(
    `
    DELETE FROM push_subscriptions
    WHERE user_address = $1 AND endpoint = $2
    `,
    [userAddress.toLowerCase(), endpoint]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function disablePushSubscriptionsForUser(userAddress: string): Promise<number> {
  const db = getLaunchpadPool();
  const result = await db.query(
    `
    UPDATE push_subscriptions
    SET enabled = false, updated_at = now()
    WHERE user_address = $1 AND enabled = true
    `,
    [userAddress.toLowerCase()]
  );
  return result.rowCount ?? 0;
}

export async function getPushSubscriptionByEndpoint(
  userAddress: string,
  endpoint: string
): Promise<PushSubscriptionRecord | null> {
  const db = getLaunchpadPool();
  const result = await db.query<PushSubscriptionRow>(
    `
    SELECT *
    FROM push_subscriptions
    WHERE user_address = $1 AND endpoint = $2 AND enabled = true
    LIMIT 1
    `,
    [userAddress.toLowerCase(), endpoint]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function userHasActivePushSubscription(userAddress: string): Promise<boolean> {
  const db = getLaunchpadPool();
  const result = await db.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM push_subscriptions
      WHERE user_address = $1 AND enabled = true
    ) AS exists
    `,
    [userAddress.toLowerCase()]
  );
  return result.rows[0]?.exists ?? false;
}

export async function listActivePushSubscriptionsForUser(
  userAddress: string
): Promise<PushSubscriptionRecord[]> {
  const db = getLaunchpadPool();
  const result = await db.query<PushSubscriptionRow>(
    `
    SELECT *
    FROM push_subscriptions
    WHERE user_address = $1 AND enabled = true
    ORDER BY updated_at DESC
    `,
    [userAddress.toLowerCase()]
  );
  return result.rows.map(mapRow);
}

export async function getPushPreferences(userAddress: string): Promise<PushPreferences> {
  const db = getLaunchpadPool();
  const result = await db.query<{
    airdrop_updates: boolean;
    trade_alerts: boolean;
    favorite_moves: boolean;
    follower_announcements: boolean;
  }>(
    `
    SELECT airdrop_updates, trade_alerts, favorite_moves, follower_announcements
    FROM push_preferences
    WHERE user_address = $1
  `,
    [userAddress.toLowerCase()]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      airdropUpdates: true,
      tradeAlerts: true,
      favoriteMoves: true,
      followerAnnouncements: true,
    };
  }

  return {
    airdropUpdates: row.airdrop_updates,
    tradeAlerts: row.trade_alerts,
    favoriteMoves: row.favorite_moves,
    followerAnnouncements: row.follower_announcements,
  };
}

export async function updatePushPreferences(
  userAddress: string,
  patch: Partial<PushPreferences>
): Promise<PushPreferences> {
  const db = getLaunchpadPool();
  const address = userAddress.toLowerCase();

  await db.query(
    `
    INSERT INTO push_preferences (user_address)
    VALUES ($1)
    ON CONFLICT (user_address) DO NOTHING
    `,
    [address]
  );

  const current = await getPushPreferences(address);
  const next: PushPreferences = {
    airdropUpdates: patch.airdropUpdates ?? current.airdropUpdates,
    tradeAlerts: patch.tradeAlerts ?? current.tradeAlerts,
    favoriteMoves: patch.favoriteMoves ?? current.favoriteMoves,
    followerAnnouncements: patch.followerAnnouncements ?? current.followerAnnouncements,
  };

  await db.query(
    `
    UPDATE push_preferences
    SET
      airdrop_updates = $2,
      trade_alerts = $3,
      favorite_moves = $4,
      follower_announcements = $5,
      updated_at = now()
    WHERE user_address = $1
    `,
    [
      address,
      next.airdropUpdates,
      next.tradeAlerts,
      next.favoriteMoves,
      next.followerAnnouncements,
    ]
  );

  return next;
}

export async function markPushSubscriptionSent(subscriptionId: number): Promise<void> {
  const db = getLaunchpadPool();
  await db.query(
    `
    UPDATE push_subscriptions
    SET last_sent_at = now(), updated_at = now()
    WHERE id = $1
    `,
    [subscriptionId]
  );
}

export async function markPushSubscriptionError(
  subscriptionId: number,
  statusCode: number | null
): Promise<void> {
  const db = getLaunchpadPool();
  await db.query(
    `
    UPDATE push_subscriptions
    SET
      last_error_at = now(),
      last_error_code = $2,
      updated_at = now(),
      enabled = CASE WHEN $2 = 410 THEN false ELSE enabled END
    WHERE id = $1
    `,
    [subscriptionId, statusCode]
  );
}

export async function deletePushSubscriptionById(subscriptionId: number): Promise<void> {
  const db = getLaunchpadPool();
  await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [subscriptionId]);
}
