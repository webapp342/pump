import { NextResponse, type NextRequest } from "next/server";
import { loadWalletSessionFromRequest } from "@/lib/auth/wallet-session";
import { updatePushPreferences } from "@/lib/db/push-subscriptions";
import type { PushPreferences } from "@/lib/push/types";

export async function PATCH(request: NextRequest) {
  try {
    const wallet = await loadWalletSessionFromRequest(request);
    if (!wallet) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<PushPreferences>;
    const patch: Partial<PushPreferences> = {};

    if (typeof body.airdropUpdates === "boolean") patch.airdropUpdates = body.airdropUpdates;
    if (typeof body.tradeAlerts === "boolean") patch.tradeAlerts = body.tradeAlerts;
    if (typeof body.favoriteMoves === "boolean") patch.favoriteMoves = body.favoriteMoves;
    if (typeof body.followerAnnouncements === "boolean") {
      patch.followerAnnouncements = body.followerAnnouncements;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No preference fields to update" }, { status: 400 });
    }

    const preferences = await updatePushPreferences(wallet.scwAddress, patch);
    return NextResponse.json({ data: { preferences } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
