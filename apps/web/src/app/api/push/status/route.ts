import { NextResponse, type NextRequest } from "next/server";
import { loadWalletSessionFromRequest } from "@/lib/auth/wallet-session";
import {
  getPushPreferences,
  getPushSubscriptionByEndpoint,
  listActivePushSubscriptionsForUser,
} from "@/lib/db/push-subscriptions";
import { isVapidConfigured } from "@/lib/push/vapid";

export async function GET(request: NextRequest) {
  try {
    const wallet = await loadWalletSessionFromRequest(request);
    if (!wallet) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const endpoint = request.nextUrl.searchParams.get("endpoint")?.trim() || null;

    if (!isVapidConfigured()) {
      return NextResponse.json({
        data: {
          configured: false,
          subscribed: false,
          subscribedOnThisDevice: false,
          subscribedOnOtherDevice: false,
          preferences: {
            airdropUpdates: true,
            tradeAlerts: true,
            favoriteMoves: true,
          },
        },
      });
    }

    const [preferences, activeSubscriptions] = await Promise.all([
      getPushPreferences(wallet.scwAddress),
      listActivePushSubscriptionsForUser(wallet.scwAddress),
    ]);

    const subscribed = activeSubscriptions.length > 0;
    let subscribedOnThisDevice = false;

    if (endpoint) {
      const record = await getPushSubscriptionByEndpoint(wallet.scwAddress, endpoint);
      subscribedOnThisDevice = Boolean(record);
    }

    const subscribedOnOtherDevice = subscribed && !subscribedOnThisDevice;

    return NextResponse.json({
      data: {
        configured: true,
        subscribed,
        subscribedOnThisDevice,
        subscribedOnOtherDevice,
        preferences,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
