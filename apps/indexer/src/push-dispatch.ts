import type pg from "pg";
import webpush from "web-push";

type TradePushInput = {
  tradeId: string;
  tokenAddress: string;
  traderAddress: string;
  side: "BUY" | "SELL";
  zugAmount: string;
  tokenAmount: string;
  txHash: string;
};

type PushSubscriptionRow = {
  id: number;
  user_address: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

const FAVORITE_ALERT_COOLDOWN_MS = 45_000;
const favoriteCooldown = new Map<string, number>();

let vapidConfigured = false;

function pushEnabled(): boolean {
  return (
    process.env.PUSH_TRADE_ALERTS_ENABLED !== "false" &&
    Boolean(process.env.VAPID_PRIVATE_KEY?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim())
  );
}

function ensureVapid(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY!.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "mailto:support@pump.local";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

function nativeSymbol(): string {
  return process.env.NATIVE_SYMBOL?.trim() || "ETH";
}

function formatAmount(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return `0 ${nativeSymbol()}`;
  if (num >= 1) return `${num.toFixed(4)} ${nativeSymbol()}`;
  if (num >= 0.0001) return `${num.toFixed(4)} ${nativeSymbol()}`;
  return `${num.toFixed(6)} ${nativeSymbol()}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function tokenPageUrl(tokenAddress: string): string {
  return `/token/${tokenAddress.toLowerCase()}`;
}

function buildPayload(input: {
  title: string;
  body: string;
  url: string;
  tag: string;
}): string {
  return JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.tag,
    icon: "/pwa/icon-192.png",
  });
}

async function listSubscriptionsForUser(
  pool: pg.Pool,
  userAddress: string
): Promise<PushSubscriptionRow[]> {
  const result = await pool.query<PushSubscriptionRow>(
    `
    SELECT id, user_address, endpoint, p256dh_key, auth_key
    FROM push_subscriptions
    WHERE user_address = $1 AND enabled = true
    ORDER BY updated_at DESC
    `,
    [userAddress.toLowerCase()]
  );
  return result.rows;
}

async function userPrefEnabled(
  pool: pg.Pool,
  userAddress: string,
  column: "trade_alerts" | "favorite_moves"
): Promise<boolean> {
  const result = await pool.query<{ enabled: boolean }>(
    `
    SELECT COALESCE(pp.${column}, true) AS enabled
    FROM push_preferences pp
    WHERE pp.user_address = $1
    `,
    [userAddress.toLowerCase()]
  );
  return result.rows[0]?.enabled ?? true;
}

async function listFavoriteAlertRecipients(
  pool: pg.Pool,
  tokenAddress: string,
  excludeTrader: string
): Promise<string[]> {
  const result = await pool.query<{ user_address: string }>(
    `
    SELECT DISTINCT tf.user_address
    FROM token_favorites tf
    INNER JOIN push_subscriptions ps
      ON ps.user_address = tf.user_address
     AND ps.enabled = true
    INNER JOIN push_preferences pp
      ON pp.user_address = tf.user_address
     AND pp.favorite_moves = true
    WHERE tf.token_address = $1
      AND tf.user_address <> $2
    `,
    [tokenAddress.toLowerCase(), excludeTrader.toLowerCase()]
  );
  return result.rows.map((row) => row.user_address);
}

async function fetchTokenSymbol(pool: pg.Pool, tokenAddress: string): Promise<string> {
  const result = await pool.query<{ symbol: string }>(
    `SELECT symbol FROM tokens WHERE address = $1 LIMIT 1`,
    [tokenAddress.toLowerCase()]
  );
  return result.rows[0]?.symbol?.trim() || shortAddress(tokenAddress);
}

async function markSent(pool: pg.Pool, subscriptionId: number): Promise<void> {
  await pool.query(
    `
    UPDATE push_subscriptions
    SET last_sent_at = now(), updated_at = now()
    WHERE id = $1
    `,
    [subscriptionId]
  );
}

async function markError(
  pool: pg.Pool,
  subscriptionId: number,
  statusCode: number | null
): Promise<void> {
  await pool.query(
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

async function deleteSubscription(pool: pg.Pool, subscriptionId: number): Promise<void> {
  await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [subscriptionId]);
}

async function sendToUser(
  pool: pg.Pool,
  userAddress: string,
  payload: { title: string; body: string; url: string; tag: string }
): Promise<void> {
  const subscriptions = await listSubscriptionsForUser(pool, userAddress);
  if (!subscriptions.length) return;

  ensureVapid();
  const message = buildPayload(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        },
        message,
        { TTL: 60 * 60, urgency: "normal" }
      );
      await markSent(pool, sub.id);
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : null;
      await markError(pool, sub.id, statusCode);
      if (statusCode === 404 || statusCode === 410) {
        await deleteSubscription(pool, sub.id);
      }
    }
  }
}

function shouldThrottleFavoriteAlert(userAddress: string, tokenAddress: string): boolean {
  const key = `${userAddress.toLowerCase()}:${tokenAddress.toLowerCase()}`;
  const now = Date.now();
  const last = favoriteCooldown.get(key) ?? 0;
  if (now - last < FAVORITE_ALERT_COOLDOWN_MS) return true;
  favoriteCooldown.set(key, now);
  return false;
}

export async function dispatchTradePushNotifications(
  pool: pg.Pool,
  input: TradePushInput
): Promise<void> {
  if (!pushEnabled()) return;

  const token = input.tokenAddress.toLowerCase();
  const trader = input.traderAddress.toLowerCase();
  const symbol = await fetchTokenSymbol(pool, token);
  const amountLabel = formatAmount(input.zugAmount);
  const sideLabel = input.side === "BUY" ? "Buy" : "Sell";
  const pageUrl = tokenPageUrl(token);

  if (await userPrefEnabled(pool, trader, "trade_alerts")) {
    const ownTitle = input.side === "BUY" ? "Buy confirmed" : "Sell confirmed";
    const ownBody = `${symbol} · ${amountLabel}`;
    await sendToUser(pool, trader, {
      title: ownTitle,
      body: ownBody,
      url: pageUrl,
      tag: `trade-own:${input.tradeId}`,
    });
  }

  const favoriters = await listFavoriteAlertRecipients(pool, token, trader);
  if (!favoriters.length) return;

  const favoriteTitle = `${symbol} ${sideLabel.toLowerCase()}`;
  const favoriteBody = `${amountLabel} · ${shortAddress(trader)}`;

  for (const userAddress of favoriters) {
    if (shouldThrottleFavoriteAlert(userAddress, token)) continue;
    await sendToUser(pool, userAddress, {
      title: favoriteTitle,
      body: favoriteBody,
      url: pageUrl,
      tag: `trade-fav:${token}:${input.tradeId}`,
    });
  }
}
