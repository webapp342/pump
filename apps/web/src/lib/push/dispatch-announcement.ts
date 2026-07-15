import { getLaunchpadReadPool } from "@/lib/db/pool";
import { sendPushToUser } from "@/lib/push/send";
import { isVapidConfigured } from "@/lib/push/vapid";
import type { TokenAnnouncementRow } from "@/lib/db/token-announcements";

function pushFollowerAnnouncementsEnabled(): boolean {
  return (
    process.env.PUSH_FOLLOWER_ANNOUNCEMENTS_ENABLED !== "false" && isVapidConfigured()
  );
}

function formatMultiplierX(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 100) return `${value.toFixed(0)}x`;
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

async function resolveTokenSymbol(tokenAddress: string): Promise<string> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ symbol: string }>(
    `SELECT symbol FROM tokens WHERE address = $1 LIMIT 1`,
    [tokenAddress.toLowerCase()]
  );
  return result.rows[0]?.symbol?.trim() || "token";
}

async function listFollowerAnnouncementRecipients(
  announcerAddress: string
): Promise<string[]> {
  const db = getLaunchpadReadPool();
  const result = await db.query<{ user_address: string }>(
    `
    SELECT DISTINCT cf.follower_address AS user_address
    FROM creator_follows cf
    INNER JOIN push_subscriptions ps
      ON ps.user_address = cf.follower_address
     AND ps.enabled = true
    INNER JOIN push_preferences pp
      ON pp.user_address = cf.follower_address
     AND pp.follower_announcements = true
    WHERE cf.creator_address = $1
      AND cf.follower_address <> $1
    `,
    [announcerAddress.toLowerCase()]
  );
  return result.rows.map((row) => row.user_address);
}

/**
 * Notify followers that a creator announced a token. Best-effort; swallow query/send errors per recipient.
 */
export async function dispatchFollowerAnnouncementPush(
  announcement: TokenAnnouncementRow
): Promise<{ recipients: number; sent: number }> {
  if (!pushFollowerAnnouncementsEnabled()) {
    return { recipients: 0, sent: 0 };
  }

  const [recipients, tokenSymbol] = await Promise.all([
    listFollowerAnnouncementRecipients(announcement.announcerAddress),
    resolveTokenSymbol(announcement.tokenAddress),
  ]);

  if (recipients.length === 0) {
    return { recipients: 0, sent: 0 };
  }

  const xLabel = formatMultiplierX(announcement.multiplierX);
  const who = announcement.announcerDisplayUsername;
  const title = `${who} called out ${tokenSymbol}`;
  const body = xLabel
    ? `${tokenSymbol} is at ${xLabel} since launch`
    : `${who} announced ${tokenSymbol}`;
  const url = `/token/${announcement.tokenAddress}`;
  const tag = `announce:${announcement.id}`;

  let sent = 0;
  for (const userAddress of recipients) {
    try {
      const result = await sendPushToUser(userAddress, { title, body, url, tag });
      sent += result.sent;
    } catch {
      // Keep best-effort delivery; one user failure should not block others.
    }
  }

  return { recipients: recipients.length, sent };
}
