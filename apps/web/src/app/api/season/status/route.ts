import { NextResponse } from "next/server";
import { getSeasonStatus } from "@/lib/redis/season-status";

export async function GET() {
  try {
    const status = await getSeasonStatus();
    return NextResponse.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Season status unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
