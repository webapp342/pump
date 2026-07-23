/**
 * Season settlement worker (F4) — archived Redis ZSETs → allocation math → PG audit.
 * On-chain chunked writes (claim_season_rewards IX) follow in a separate phase.
 */
import "dotenv/config";
import { creditSeasonAllocationsOnChain, type CreditRow } from "./on-chain.js";
import { Connection, PublicKey } from "@solana/web3.js";
import pg from "pg";
import { Redis } from "ioredis";
import {
  REDIS_KEYS,
  allocateClanSeasonPool,
  allocatePoolByXp,
  type ClanMemberXp,
  type RankedEntry,
} from "@pump/xp";
import { PDA_SEEDS, PROGRAM_IDS, resolveSolanaRpcUrl } from "@pump/solana-sdk";

function pdaBalanceLamports(
  conn: Connection,
  seed: string,
  programId: PublicKey
): Promise<bigint> {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(seed)],
    programId
  );
  return conn.getBalance(pda, "confirmed").then(BigInt);
}

async function loadClanContext(
  pool: pg.Pool,
  clanIds: string[]
): Promise<{
  leaderByClan: Map<string, string>;
  membersByClan: Map<string, ClanMemberXp[]>;
}> {
  const leaderByClan = new Map<string, string>();
  const membersByClan = new Map<string, ClanMemberXp[]>();
  if (clanIds.length === 0) {
    return { leaderByClan, membersByClan };
  }

  const leaders = await pool.query<{ id: string; leader_address: string }>(
    `SELECT id::text, leader_address FROM clans WHERE id = ANY($1::uuid[])`,
    [clanIds]
  );
  for (const row of leaders.rows) {
    leaderByClan.set(row.id, row.leader_address);
  }

  const members = await pool.query<{
    clan_id: string;
    wallet_address: string;
    role: string;
  }>(
    `
      SELECT clan_id::text, wallet_address, role
      FROM clan_members
      WHERE clan_id = ANY($1::uuid[])
    `,
    [clanIds]
  );

  for (const row of members.rows) {
    const list = membersByClan.get(row.clan_id) ?? [];
    list.push({
      wallet: row.wallet_address,
      xp: 0,
      role: row.role,
    });
    membersByClan.set(row.clan_id, list);
  }

  return { leaderByClan, membersByClan };
}

async function enrichMemberXpFromArchive(
  redis: Redis,
  seasonId: number,
  membersByClan: Map<string, ClanMemberXp[]>
): Promise<void> {
  const userArchive = REDIS_KEYS.archivedUserXp(seasonId);
  const allWallets = [...membersByClan.values()].flat().map((m) => m.wallet);
  if (allWallets.length === 0) return;

  const pipeline = redis.pipeline();
  for (const wallet of allWallets) {
    pipeline.zscore(userArchive, wallet);
  }
  const scores = await pipeline.exec();
  if (!scores) return;

  let idx = 0;
  for (const [, memberList] of membersByClan) {
    for (const member of memberList) {
      const row = scores[idx++];
      const score = row?.[1];
      member.xp = Math.floor(Number(score ?? 0));
    }
  }
}

async function main(): Promise<void> {
  const seasonId = Number.parseInt(process.argv[2] ?? "0", 10);
  if (!Number.isFinite(seasonId) || seasonId <= 0) {
    throw new Error("usage: settlement-worker <seasonId>");
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  const dbUrl = process.env.LAUNCHPAD_DATABASE_URL?.trim();
  if (!redisUrl || !dbUrl) {
    throw new Error("REDIS_URL and LAUNCHPAD_DATABASE_URL required");
  }

  const redis = new Redis(redisUrl);
  const pool = new pg.Pool({ connectionString: dbUrl });

  const userKey = REDIS_KEYS.archivedUserXp(seasonId);
  const clanKey = REDIS_KEYS.archivedClanXp(seasonId);

  const [users, clans] = await Promise.all([
    redis.zrevrange(userKey, 0, 99, "WITHSCORES"),
    redis.zrevrange(clanKey, 0, 2, "WITHSCORES"),
  ]);

  const topUsers: RankedEntry[] = [];
  for (let i = 0; i < users.length; i += 2) {
    topUsers.push({
      id: users[i]!,
      xp: Math.floor(Number(users[i + 1] ?? 0)),
      rank: topUsers.length + 1,
    });
  }

  const topClans: RankedEntry[] = [];
  for (let i = 0; i < clans.length; i += 2) {
    topClans.push({
      id: clans[i]!,
      xp: Math.floor(Number(clans[i + 1] ?? 0)),
      rank: topClans.length + 1,
    });
  }

  let seasonPoolLamports = 0n;
  let clanPoolLamports = 0n;
  const rpc = resolveSolanaRpcUrl({
    cluster: process.env.SOLANA_CLUSTER,
    rpcUrl: process.env.SOLANA_RPC_URL,
  });
  try {
    const conn = new Connection(rpc, "confirmed");
    const programId = new PublicKey(PROGRAM_IDS.launchpad);
    [seasonPoolLamports, clanPoolLamports] = await Promise.all([
      pdaBalanceLamports(conn, PDA_SEEDS.seasonAccrual, programId),
      pdaBalanceLamports(conn, PDA_SEEDS.clanPoolAccrual, programId),
    ]);
  } catch (err) {
    console.warn("[settlement-worker] RPC pool balance skipped:", err);
  }

  const vaultRent = 890_880n;
  const seasonPool = seasonPoolLamports > vaultRent ? seasonPoolLamports - vaultRent : 0n;
  const clanPool = clanPoolLamports > vaultRent ? clanPoolLamports - vaultRent : 0n;

  const userAllocations = allocatePoolByXp(topUsers, seasonPool);
  const { leaderByClan, membersByClan } = await loadClanContext(
    pool,
    topClans.map((c) => c.id)
  );
  await enrichMemberXpFromArchive(redis, seasonId, membersByClan);
  const clanAllocations = allocateClanSeasonPool({
    topClans,
    totalLamports: clanPool,
    membersByClan,
    leaderByClan,
  });

  const creditOnChain = process.argv.includes("--credit-on-chain");

  const run = await pool.query<{ id: string }>(
    `
      INSERT INTO season_settlement_runs (season_id, status, finished_at, metadata)
      VALUES ($1, 'completed', now(), $2::jsonb)
      RETURNING id::text
    `,
    [
      seasonId,
      JSON.stringify({
        topUsers,
        topClans,
        seasonPoolLamports: seasonPool.toString(),
        clanPoolLamports: clanPool.toString(),
        userAllocations: userAllocations.map((row) => ({
          wallet: row.id,
          rank: row.rank,
          xp: row.xp,
          lamports: row.lamports.toString(),
        })),
        clanAllocations: clanAllocations.map((row) => ({
          wallet: row.wallet,
          clanId: row.clanId,
          clanRank: row.clanRank,
          lamports: row.lamports.toString(),
        })),
        onChainPhase: creditOnChain ? "running" : "pending",
        computedAt: new Date().toISOString(),
      }),
    ]
  );

  let onChainResult: { signatures: string[]; credited: number } | null = null;
  if (creditOnChain) {
    const creditRows: CreditRow[] = [
      ...userAllocations
        .filter((row) => row.lamports > 0n)
        .map((row) => ({
          wallet: row.id,
          lamports: row.lamports,
          poolKind: 0 as CreditRow["poolKind"],
        })),
      ...clanAllocations
        .filter((row) => row.lamports > 0n)
        .map((row) => ({
          wallet: row.wallet,
          lamports: row.lamports,
          poolKind: 1 as CreditRow["poolKind"],
        })),
    ];
    onChainResult = await creditSeasonAllocationsOnChain({
      seasonId,
      rows: creditRows,
    });
    await redis.set(REDIS_KEYS.seasonClaimsOpen(seasonId), "true");
  } else {
    await redis.set(REDIS_KEYS.seasonClaimsOpen(seasonId), "false");
  }

  if (onChainResult) {
    await pool.query(
      `
        UPDATE season_settlement_runs
        SET metadata = metadata || $2::jsonb
        WHERE id = $1::uuid
      `,
      [
        run.rows[0]?.id,
        JSON.stringify({
          onChainPhase: "completed",
          onChainSignatures: onChainResult.signatures,
          onChainCredited: onChainResult.credited,
        }),
      ]
    );
  }

  console.log("[settlement-worker] done", {
    seasonId,
    runId: run.rows[0]?.id,
    userCount: topUsers.length,
    clanCount: topClans.length,
    seasonPool: seasonPool.toString(),
    clanPool: clanPool.toString(),
    creditOnChain,
    onChainCredited: onChainResult?.credited ?? 0,
  });

  await redis.quit();
  await pool.end();
}

main().catch((err) => {
  console.error("[settlement-worker] failed", err);
  process.exit(1);
});
