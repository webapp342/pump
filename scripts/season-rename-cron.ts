#!/usr/bin/env tsx
/**
 * Season rollover — RENAME weekly XP ZSETs (guncelleme3).
 * Schedule: Pazar 23:59:59 UTC (systemd timer).
 */
import "dotenv/config";
import { Redis } from "ioredis";
import { REDIS_KEYS, parseSeasonMeta } from "@pump/xp";

async function main(): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error("REDIS_URL required");

  const dryRun = process.argv.includes("--dry-run");
  const client = new Redis(url);

  const metaRaw = await client.hgetall(REDIS_KEYS.seasonCurrent);
  const season = parseSeasonMeta(metaRaw);
  const nextId = season.id + 1;

  const userArchive = REDIS_KEYS.archivedUserXp(season.id);
  const clanArchive = REDIS_KEYS.archivedClanXp(season.id);

  console.log("[season-cron] rollover", {
    fromSeason: season.id,
    toSeason: nextId,
    userArchive,
    clanArchive,
    dryRun,
  });

  if (dryRun) {
    await client.quit();
    return;
  }

  const userExists = await client.exists(REDIS_KEYS.weeklyUserXp);
  const clanExists = await client.exists(REDIS_KEYS.weeklyClanXp);

  const multi = client.multi();
  if (userExists) {
    multi.rename(REDIS_KEYS.weeklyUserXp, userArchive);
  }
  if (clanExists) {
    multi.rename(REDIS_KEYS.weeklyClanXp, clanArchive);
  }
  multi.hset(REDIS_KEYS.seasonCurrent, {
    id: String(nextId),
    started_at: new Date().toISOString(),
  });
  multi.set(REDIS_KEYS.seasonClaimsOpen(season.id), "false");
  await multi.exec();

  console.log("[season-cron] done — fresh ZSETs on next ZINCRBY");
  await client.quit();
}

main().catch((err) => {
  console.error("[season-cron] failed", err);
  process.exit(1);
});
