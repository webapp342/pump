import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { listAnnouncementsByUser } from "@/lib/db/token-announcements";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = normalizeAddressParam(searchParams.get("address"));
    if (!address) {
      return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
    }

    const limitRaw = Number(searchParams.get("limit") ?? "50");
    const announcements = await listAnnouncementsByUser(
      address,
      Number.isFinite(limitRaw) ? limitRaw : 50
    );
    return NextResponse.json({ data: { announcements } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
