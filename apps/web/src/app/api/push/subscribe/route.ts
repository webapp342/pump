import { NextResponse, type NextRequest } from "next/server";
import { loadWalletSessionFromRequest } from "@/lib/auth/wallet-session";
import { upsertPushSubscription } from "@/lib/db/push-subscriptions";
import { parsePushDisplayMode, parsePushPlatform } from "@/lib/push/platform";
import { isVapidConfigured } from "@/lib/push/vapid";
import {
  PushSubscriptionValidationError,
  parsePushSubscriptionBody,
} from "@/lib/push/validate-subscription";

export async function POST(request: NextRequest) {
  try {
    if (!isVapidConfigured()) {
      return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
    }

    const wallet = await loadWalletSessionFromRequest(request);
    if (!wallet) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      subscription?: unknown;
      platform?: unknown;
      displayMode?: unknown;
    };

    const subscription = parsePushSubscriptionBody(body.subscription);
    const platform = parsePushPlatform(body.platform);
    const displayMode = parsePushDisplayMode(body.displayMode);

    const record = await upsertPushSubscription({
      userAddress: wallet.scwAddress,
      subscription,
      platform,
      displayMode,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      data: {
        subscribed: true,
        endpoint: record.endpoint,
        platform: record.platform,
        displayMode: record.displayMode,
      },
    });
  } catch (error) {
    if (error instanceof PushSubscriptionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
