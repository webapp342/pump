import { NextResponse, type NextRequest } from "next/server";
import { loadWalletSessionFromRequest } from "@/lib/auth/wallet-session";
import { deletePushSubscriptionForUser } from "@/lib/db/push-subscriptions";
import { isAllowedPushEndpoint } from "@/lib/push/validate-subscription";

export async function POST(request: NextRequest) {
  try {
    const wallet = await loadWalletSessionFromRequest(request);
    if (!wallet) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as { endpoint?: string };
    const endpoint = body.endpoint?.trim() ?? "";
    if (!endpoint || !isAllowedPushEndpoint(endpoint)) {
      return NextResponse.json({ error: "Valid endpoint is required" }, { status: 400 });
    }

    const removed = await deletePushSubscriptionForUser(wallet.scwAddress, endpoint);
    return NextResponse.json({ data: { removed } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
