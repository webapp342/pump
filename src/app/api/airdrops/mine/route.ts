import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { listMyAirdropIds, listMyAirdropParticipations, refreshParticipantSnapshot } from "@/lib/db/airdrops";

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(50, Math.max(1, Number(limitRaw) || 20)) : 20;

  try {
    const ids = await listMyAirdropIds(address);
    await Promise.all(
      ids.slice(0, limit).map((id) =>
        refreshParticipantSnapshot(id, address).catch(() => undefined)
      )
    );
    const data = await listMyAirdropParticipations(address, limit);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
