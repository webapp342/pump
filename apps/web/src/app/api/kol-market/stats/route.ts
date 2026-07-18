import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { ensureDynamicRoute, searchParam } from "@/lib/api/route-dynamic";
import { getKolUserStats } from "@/lib/db/kol-market";

/** GET /api/kol-market/stats?address= — rollup stats for profile cards. */
export async function GET(request: NextRequest) {
  await ensureDynamicRoute();

  try {
    const address = normalizeAddressParam(searchParam(request, "address"));
    if (!address) {
      return NextResponse.json({ error: "Valid address required" }, { status: 400 });
    }

    const stats = await getKolUserStats(address);
    return NextResponse.json(
      { success: true, data: stats },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    console.error("[kol-market/stats]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
