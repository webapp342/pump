import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { listTokenAnnouncements } from "@/lib/db/token-announcements";

type RouteContext = {
  params: Promise<{ address: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { address: raw } = await context.params;
    const tokenAddress = normalizeAddressParam(raw);
    if (!tokenAddress) {
      return NextResponse.json({ error: "Valid token address is required" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? "40");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 40;

    const announcements = await listTokenAnnouncements(tokenAddress, limit);
    return NextResponse.json({ data: { announcements } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
