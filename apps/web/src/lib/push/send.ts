import webpush from "web-push";
import {
  deletePushSubscriptionById,
  listActivePushSubscriptionsForUser,
  markPushSubscriptionError,
  markPushSubscriptionSent,
  type PushSubscriptionRecord,
} from "@/lib/db/push-subscriptions";
import type { PushNotificationPayload } from "@/lib/push/types";
import { getVapidPrivateKey, getVapidPublicKey, getVapidSubject, isVapidConfigured } from "@/lib/push/vapid";

let configured = false;

function ensureWebPushConfigured(): void {
  if (configured) return;
  if (!isVapidConfigured()) {
    throw new Error("Web Push VAPID keys are not configured");
  }
  webpush.setVapidDetails(getVapidSubject(), getVapidPublicKey()!, getVapidPrivateKey()!);
  configured = true;
}

function toWebPushSubscription(record: PushSubscriptionRecord): webpush.PushSubscription {
  return {
    endpoint: record.endpoint,
    keys: {
      p256dh: record.p256dhKey,
      auth: record.authKey,
    },
  };
}

function toWebPushPayload(payload: PushNotificationPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag ?? "pump-notification",
    icon: payload.icon ?? "/pwa/icon-192.png",
  });
}

export async function sendPushToSubscription(
  record: PushSubscriptionRecord,
  payload: PushNotificationPayload
): Promise<void> {
  ensureWebPushConfigured();
  try {
    await webpush.sendNotification(toWebPushSubscription(record), toWebPushPayload(payload), {
      TTL: 60 * 60,
      urgency: "normal",
    });
    await markPushSubscriptionSent(record.id);
  } catch (error) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : null;

    await markPushSubscriptionError(record.id, statusCode);

    if (statusCode === 404 || statusCode === 410) {
      await deletePushSubscriptionById(record.id);
    }

    throw error;
  }
}

export async function sendPushToUser(
  userAddress: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await listActivePushSubscriptionsForUser(userAddress);
  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      await sendPushToSubscription(subscription, payload);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { sent, failed };
}
