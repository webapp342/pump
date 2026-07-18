import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ensureDynamicRoute } from "@/lib/api/route-dynamic";
import { listKolMarketExplore } from "@/lib/db/kol-market";

/** GET /api/kol-market/explore — active KOL profiles with rollup stats. */
export async function GET(_request: NextRequest) {
  await ensureDynamicRoute();

  try {
    const rows = await listKolMarketExplore(48);
    return NextResponse.json(
      { success: true, data: { kols: rows } },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load KOL market";
    console.error("[kol-market/explore]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
