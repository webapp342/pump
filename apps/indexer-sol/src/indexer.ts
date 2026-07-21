import { config } from "./config.js";
import { createPool, getIndexerStartSlot, updateIndexerSlot } from "./db.js";
import { extractEventsFromLogs } from "./decode.js";
import { SolanaEventHandlers } from "./handlers.js";
import { createEventSource, type SolanaLogBatch } from "./laserstream.js";
import { PointsBridge } from "./points.js";
import { eventId } from "./units.js";

const pool = createPool(config.launchpadDatabaseUrl);
const handlers = new SolanaEventHandlers({
  launchpadPool: pool,
  chainId: config.chainId,
  tokenDecimals: config.tokenDecimals,
  pointsBridge: new PointsBridge(pool),
});

/** Dedup when factory + curve onLogs both receive the same tx log set. */
const recentEventIds = new Set<string>();
const RECENT_CAP = 5_000;

let shuttingDown = false;
let maxSlotSeen = 0n;

process.on("SIGINT", () => {
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  shuttingDown = true;
});

function rememberEvent(id: string): boolean {
  if (recentEventIds.has(id)) return false;
  recentEventIds.add(id);
  if (recentEventIds.size > RECENT_CAP) {
    const first = recentEventIds.values().next().value;
    if (first !== undefined) recentEventIds.delete(first);
  }
  return true;
}

async function onBatch(batch: SolanaLogBatch): Promise<void> {
  if (batch.err) {
    return;
  }

  const slot = BigInt(batch.slot);
  if (slot > maxSlotSeen) {
    maxSlotSeen = slot;
  }

  const events = extractEventsFromLogs({
    logs: batch.logs,
    signature: batch.signature,
    slot: batch.slot,
    programId: batch.programId,
  });

  for (const event of events) {
    const id = eventId(event.signature, event.logIndex);
    if (!rememberEvent(id)) continue;
    try {
      await handlers.dispatch(event);
    } catch (err) {
      console.error(
        `[indexer-sol] handler failed name=${event.name} sig=${event.signature}`,
        err
      );
    }
  }
}

async function persistCursor(): Promise<void> {
  if (maxSlotSeen > 0n) {
    await updateIndexerSlot(pool, config.stateKey, maxSlotSeen);
  }
}

async function main(): Promise<void> {
  const startSlot = await getIndexerStartSlot(
    pool,
    config.stateKey,
    config.startSlot
  );
  maxSlotSeen = startSlot;

  console.log(
    `solana indexer ready: cluster=${config.cluster} chainId=${config.chainId} rpc=${config.rpcUrl} source=${config.source} stateKey=${config.stateKey} startSlot=${startSlot}`
  );

  const source = createEventSource(config);
  await source.start(onBatch);

  const cursorTimer = setInterval(() => {
    void persistCursor().catch((err) => {
      console.error("[indexer-sol] cursor persist failed", err);
    });
  }, Math.max(config.pollIntervalMs, 1_000));

  if (config.once) {
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    shuttingDown = true;
  }

  while (!shuttingDown) {
    await new Promise((r) => setTimeout(r, 500));
  }

  clearInterval(cursorTimer);
  await source.stop();
  await persistCursor();
  await pool.end();
  console.log("[indexer-sol] stopped");
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
