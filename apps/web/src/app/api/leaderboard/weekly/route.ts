import { NextRequest, NextResponse } from "next/server";
import {
  getSeasonMeta,
  getWeeklyClanLeaderboard,
  getWeeklyLeaderboard,
} from "@/lib/redis/weekly-xp";
import { getLaunchpadPool } from "@/lib/db/launchpad";

export async function GET(request: NextRequest) {
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);
  const includeClans = request.nextUrl.searchParams.get("clans") === "1";

  const [season, users, clans] = await Promise.all([
    getSeasonMeta(),
    getWeeklyLeaderboard(limit),
    includeClans ? getWeeklyClanLeaderboard(Math.min(limit, 50)) : Promise.resolve([]),
  ]);

  let clanNames: Record<string, string> = {};
  if (clans.length > 0) {
    try {
      const pool = getLaunchpadPool();
      const ids = clans.map((c) => c.clanId);
      const res = await pool.query<{ id: string; name: string }>(
        `SELECT id::text, name FROM clans WHERE id = ANY($1::uuid[])`,
        [ids]
      );
      clanNames = Object.fromEntries(res.rows.map((r) => [r.id, r.name]));
    } catch {
      // clans table may not exist yet pre-migration
    }
  }

  return NextResponse.json({
    data: {
      season,
      users,
      clans: clans.map((c) => ({
        ...c,
        name: clanNames[c.clanId] ?? null,
      })),
    },
  });
}
