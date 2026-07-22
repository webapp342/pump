import { NextRequest, NextResponse } from "next/server";
import { CASHBACK_XP_THRESHOLD, getWeeklyUserXp } from "@/lib/redis/weekly-xp";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const weeklyXp = await getWeeklyUserXp(address);
  return NextResponse.json({
    data: {
      address,
      weeklyXp,
      cashbackEligible: weeklyXp >= CASHBACK_XP_THRESHOLD,
      threshold: CASHBACK_XP_THRESHOLD,
    },
  });
}
