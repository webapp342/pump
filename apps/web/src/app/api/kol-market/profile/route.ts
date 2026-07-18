import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { ensureDynamicRoute, searchParam } from "@/lib/api/route-dynamic";
import {
  evaluateVerifiedKolTier,
  getKolProfileDetail,
  getKolUserStats,
  upsertKolProfile,
} from "@/lib/db/kol-market";

/** GET /api/kol-market/profile?address= */
export async function GET(request: NextRequest) {
  await ensureDynamicRoute();

  try {
    const address = normalizeAddressParam(searchParam(request, "address"));
    if (!address) {
      return NextResponse.json({ error: "Valid address required" }, { status: 400 });
    }

    const [profile, stats] = await Promise.all([
      getKolProfileDetail(address),
      getKolUserStats(address),
    ]);

    return NextResponse.json(
      { success: true, data: { profile, stats } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load KOL profile";
    console.error("[kol-market/profile GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/kol-market/profile — register or update KOL listing. */
export async function PUT(request: NextRequest) {
  await ensureDynamicRoute();

  try {
    const body = (await request.json()) as {
      address?: string;
      minPriceUsd?: number;
      isActive?: boolean;
      bio?: string | null;
    };

    const address = normalizeAddressParam(body.address);
    if (!address) {
      return NextResponse.json({ error: "Valid address required" }, { status: 400 });
    }

    const minPriceUsd = Number(body.minPriceUsd ?? 10);
    if (!Number.isFinite(minPriceUsd) || minPriceUsd < 1) {
      return NextResponse.json({ error: "minPriceUsd must be at least 1" }, { status: 400 });
    }

    await upsertKolProfile({
      address,
      minPriceUsd,
      isActive: body.isActive !== false,
      bio: body.bio ?? null,
    });

    const tier = await evaluateVerifiedKolTier(address);
    const profile = await getKolProfileDetail(address);

    return NextResponse.json({ success: true, data: { profile, tier } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update KOL profile";
    console.error("[kol-market/profile PUT]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
