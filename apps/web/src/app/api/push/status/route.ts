import { NextResponse, type NextRequest } from "next/server";
import { loadWalletSessionFromRequest } from "@/lib/auth/wallet-session";
import { getPushPreferences, userHasActivePushSubscription } from "@/lib/db/push-subscriptions";
import { isVapidConfigured } from "@/lib/push/vapid";

export async function GET(request: NextRequest) {
  try {
    const wallet = await loadWalletSessionFromRequest(request);
    if (!wallet) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!isVapidConfigured()) {
      return NextResponse.json({
        data: {
          configured: false,
          subscribed: false,
          preferences: {
            airdropUpdates: true,
            tradeAlerts: true,
            favoriteMoves: true,
          },
        },
      });
    }

    const [subscribed, preferences] = await Promise.all([
      userHasActivePushSubscription(wallet.scwAddress),
      getPushPreferences(wallet.scwAddress),
    ]);

    return NextResponse.json({
      data: {
        configured: true,
        subscribed,
        preferences,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
