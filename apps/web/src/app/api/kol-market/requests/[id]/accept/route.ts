import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { ensureDynamicRoute } from "@/lib/api/route-dynamic";
import { acceptKolCalloutRequest } from "@/lib/db/kol-market";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/kol-market/requests/[id]/accept */
export async function POST(request: Request, context: RouteContext) {
  await ensureDynamicRoute();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { kolAddress?: string };
    const kolAddress = normalizeAddressParam(body.kolAddress);

    if (!kolAddress || !id) {
      return NextResponse.json({ error: "Valid kolAddress required" }, { status: 400 });
    }

    const result = await acceptKolCalloutRequest({ requestId: id, kolAddress });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to accept request";
    const status =
      message === "Request not found or expired" || message === "Escrow payment not confirmed"
        ? 404
        : message === "Token not found"
          ? 404
          : 500;
    console.error("[kol-market/requests/accept]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
