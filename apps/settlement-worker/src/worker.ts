/**
 * Season settlement worker (F4) — reads archived Redis ZSETs, writes audit to PG.
 * On-chain chunked allocation is triggered separately after review.
 */
import "dotenv/config";
import pg from "pg";
import { Redis } from "ioredis";
import { REDIS_KEYS } from "@pump/xp";

async function main(): Promise<void> {
  const seasonId = Number.parseInt(process.argv[2] ?? "0", 10);
  if (!Number.isFinite(seasonId) || seasonId <= 0) {
    throw new Error("usage: settlement-worker <seasonId>");
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  const dbUrl = process.env.LAUNCHPAD_DATABASE_URL?.trim();
  if (!redisUrl || !dbUrl) throw new Error("REDIS_URL and LAUNCHPAD_DATABASE_URL required");

  const redis = new Redis(redisUrl);
  const pool = new pg.Pool({ connectionString: dbUrl });

  const userKey = REDIS_KEYS.archivedUserXp(seasonId);
  const clanKey = REDIS_KEYS.archivedClanXp(seasonId);

  const [users, clans] = await Promise.all([
    redis.zrevrange(userKey, 0, 99, "WITHSCORES"),
    redis.zrevrange(clanKey, 0, 2, "WITHSCORES"),
  ]);

  const topUsers: Array<{ wallet: string; xp: number; rank: number }> = [];
  for (let i = 0; i < users.length; i += 2) {
    topUsers.push({
      wallet: users[i]!,
      xp: Math.floor(Number(users[i + 1] ?? 0)),
      rank: topUsers.length + 1,
    });
  }

  const topClans: Array<{ clanId: string; xp: number; rank: number }> = [];
  for (let i = 0; i < clans.length; i += 2) {
    topClans.push({
      clanId: clans[i]!,
      xp: Math.floor(Number(clans[i + 1] ?? 0)),
      rank: topClans.length + 1,
    });
  }

  const run = await pool.query<{ id: string }>(
    `
      INSERT INTO season_settlement_runs (season_id, status, metadata)
      VALUES ($1, 'completed', $2::jsonb)
      RETURNING id::text
    `,
    [
      seasonId,
      JSON.stringify({
        topUsers,
        topClans,
        computedAt: new Date().toISOString(),
      }),
    ]
  );

  await redis.set(REDIS_KEYS.seasonClaimsOpen(seasonId), "true");
  console.log("[settlement-worker] done", {
    seasonId,
    runId: run.rows[0]?.id,
    userCount: topUsers.length,
    clanCount: topClans.length,
  });

  await redis.quit();
  await pool.end();
}

main().catch((err) => {
  console.error("[settlement-worker] failed", err);
  process.exit(1);
});
