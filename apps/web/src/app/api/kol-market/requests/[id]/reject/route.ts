import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { ensureDynamicRoute } from "@/lib/api/route-dynamic";
import { rejectKolCalloutRequest } from "@/lib/db/kol-market";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/kol-market/requests/[id]/reject */
export async function POST(request: Request, context: RouteContext) {
  await ensureDynamicRoute();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { kolAddress?: string; reason?: string };
    const kolAddress = normalizeAddressParam(body.kolAddress);

    if (!kolAddress || !id) {
      return NextResponse.json({ error: "Valid kolAddress required" }, { status: 400 });
    }

    const requestRow = await rejectKolCalloutRequest({
      requestId: id,
      kolAddress,
      reason: body.reason,
    });

    return NextResponse.json({ success: true, data: { request: requestRow } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reject request";
    const status = message === "Request not found" ? 404 : 500;
    console.error("[kol-market/requests/reject]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
