import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import {
  restartIndexerServices,
  restartPostWipeRealtimeStack,
} from "@/lib/admin/env-reload";
import {
  WIPE_DATA_CONFIRMATION_PHRASE,
  WIPE_PRESERVED_TABLES,
  wipeLaunchpadAppData,
  wipeRuntimeStoresOnly,
} from "@/lib/db/admin-wipe";
import { syncContractRegistryFromEnv } from "@/lib/db/contract-registry-seed";
import { seedIndexerStateFromEnv } from "@/lib/db/indexer-env-seed";

function schedulePostWipeRestarts(): void {
  void (async () => {
    try {
      await restartIndexerServices();
    } catch (error) {
      console.error("[wipe-data] indexer restart failed:", error);
    }
    try {
      await restartPostWipeRealtimeStack();
    } catch (error) {
      console.error("[wipe-data] realtime/ch-flusher restart failed:", error);
    }
  })();
}

export async function POST(request: NextRequest) {
  const admin = requireAdminWallet(request);
  if (!admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { confirmation?: string };
    const confirmation = body.confirmation?.trim();
    if (confirmation !== WIPE_DATA_CONFIRMATION_PHRASE) {
      return NextResponse.json(
        { error: `Type exactly: ${WIPE_DATA_CONFIRMATION_PHRASE}` },
        { status: 400 }
      );
    }

    const wipeResult = await wipeLaunchpadAppData();
    const contractRegistrySeed = await syncContractRegistryFromEnv();
    const indexerSeed = await seedIndexerStateFromEnv();
    const warnings: string[] = [];

    if (!contractRegistrySeed.ok) {
      warnings.push(contractRegistrySeed.reason);
    }
    if (!indexerSeed.ok) {
      warnings.push(indexerSeed.reason);
    }
    if (wipeResult.runtime?.clickhouse && !wipeResult.runtime.clickhouse.ok) {
      warnings.push(`ClickHouse purge: ${wipeResult.runtime.clickhouse.error ?? "failed"}`);
    }
    if (wipeResult.warnings?.length) {
      warnings.push(...wipeResult.warnings);
    }

    schedulePostWipeRestarts();

    return NextResponse.json({
      data: {
        ...wipeResult,
        preserved: [...WIPE_PRESERVED_TABLES],
        wipedBy: admin,
        wipedAt: new Date().toISOString(),
        contractRegistrySeed,
        indexerSeed,
        indexerRestart: { scheduled: true },
        realtimeRestart: { scheduled: true },
        warnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // PG may have truncated before a follow-up step failed — still clear Redis leaderboard.
    if (message.includes("permission denied") || message.includes("points_inventory")) {
      try {
        const runtime = await wipeRuntimeStoresOnly();
        if (runtime.redis?.ok) {
          return NextResponse.json({
            data: {
              ok: true,
              partial: true,
              preserved: [...WIPE_PRESERVED_TABLES],
              wipedBy: admin,
              wipedAt: new Date().toISOString(),
              runtime,
              warnings: [
                "PostgreSQL wipe completed but a legacy purge step failed (fixed in next deploy). Redis leaderboard cleared — refresh Rewards page.",
                message,
              ],
            },
          });
        }
      } catch {
        // fall through
      }
    }

    const missingFn =
      message.includes("wipe_launchpad_app_data") && message.includes("does not exist");
    if (missingFn) {
      return NextResponse.json(
        {
          error:
            "Wipe function not installed. Run pending DB migrations (055_wipe_clans_and_runtime.sql).",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
