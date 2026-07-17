import type { Hash } from "viem";
import { config } from "./config.js";
import { closePools, createPools } from "./db.js";
import { recomputeKing } from "./king.js";
import { FIRST_SMART_BUY_MIN_WEI, VOLUME_MONSTER_MIN_BNB } from "./mission-thresholds.js";
import { PointsBridge, TASK_KEYS } from "./points.js";

/**
 * Backfill launchpad mission awards for trades/tokens already indexed
 * when VM1_MAIN_DB_URL was missing or indexer was down.
 */
async function main(): Promise<void> {
  const pools = createPools(config.launchpadDatabaseUrl, config.vm1MainDatabaseUrl);
  if (!pools.vm1) {
    throw new Error(
      "VM1_MAIN_DB_URL is required — set it to the same pump_db URL as LAUNCHPAD_DATABASE_URL on this VM."
    );
  }

  const pointsBridge = new PointsBridge(pools.vm1);
  let deployCount = 0;
  let swapCount = 0;
  let smartBuyCount = 0;
  let invitedCount = 0;
  let volumeCount = 0;

  try {
    const tokens = await pools.launchpad.query<{
      address: string;
      creator_address: string;
      launch_tx_hash: string;
      created_at: Date;
    }>(
      `
        SELECT address, creator_address, launch_tx_hash, created_at
        FROM tokens
        WHERE is_hidden = false
        ORDER BY created_at ASC
      `
    );

    for (const token of tokens.rows) {
      const txHash = token.launch_tx_hash as Hash;
      await pointsBridge.award({
        address: token.creator_address,
        taskKey: TASK_KEYS.deployMeme,
        eventId: `${txHash}:0`,
        txHash,
        blockTime: token.created_at,
        metadata: { token: token.address, source: "sync_missions" },
      });
      deployCount++;
    }

    const trades = await pools.launchpad.query<{
      event_id: string;
      token_address: string;
      trader_address: string;
      side: string;
      zug_amount: string;
      tx_hash: string;
      block_time: Date;
    }>(
      `
        SELECT event_id, token_address, trader_address, side, zug_amount::text, tx_hash, block_time
        FROM trades
        ORDER BY block_time ASC, block_number ASC, log_index ASC
      `
    );

    for (const trade of trades.rows) {
      const txHash = trade.tx_hash as Hash;
      await pointsBridge.award({
        address: trade.trader_address,
        taskKey: TASK_KEYS.dailySwap,
        eventId: trade.event_id,
        txHash,
        blockTime: trade.block_time,
        daily: true,
        metadata: { token: trade.token_address, side: trade.side, source: "sync_missions" },
      });
      swapCount++;

      const zugBnb = Number(trade.zug_amount);
      if (trade.side === "BUY" && zugBnb >= Number(FIRST_SMART_BUY_MIN_WEI) / 1e18) {
        const creatorResult = await pools.launchpad.query<{ creator_address: string }>(
          "SELECT creator_address FROM tokens WHERE address = $1",
          [trade.token_address]
        );
        const creator = creatorResult.rows[0]?.creator_address;
        if (creator && creator !== trade.trader_address) {
          await pointsBridge.award({
            address: trade.trader_address,
            taskKey: TASK_KEYS.firstSmartBuy,
            eventId: trade.event_id,
            txHash,
            blockTime: trade.block_time,
            metadata: { token: trade.token_address, source: "sync_missions" },
          });
          smartBuyCount++;
        }
      }
    }

    const volumes = await pools.launchpad.query<{
      address: string;
      total_volume_zug: string;
    }>("SELECT address, total_volume_zug::text FROM user_volumes");

    for (const row of volumes.rows) {
      if (Number(row.total_volume_zug) < VOLUME_MONSTER_MIN_BNB) continue;
      await pointsBridge.award({
        address: row.address,
        taskKey: TASK_KEYS.volumeMonster,
        eventId: `${row.address}:volume-monster`,
        txHash: `0x${"0".repeat(64)}` as Hash,
        blockTime: new Date(),
        metadata: { source: "sync_missions", threshold_bnb: VOLUME_MONSTER_MIN_BNB },
      });
      volumeCount++;
    }

    const invitedRows = await pools.launchpad.query<{
      invitee_address: string;
      referrer_address: string;
      bound_tx_hash: string;
      bound_at: Date;
    }>(
      `
        SELECT invitee_address, referrer_address, bound_tx_hash, bound_at
        FROM referral_bindings
      `
    );

    for (const row of invitedRows.rows) {
      await pointsBridge.award({
        address: row.invitee_address,
        taskKey: TASK_KEYS.invitedFirstTrade,
        eventId: row.invitee_address,
        txHash: row.bound_tx_hash as Hash,
        blockTime: row.bound_at,
        metadata: {
          source: "sync_missions",
          referrer: row.referrer_address,
        },
      });
      invitedCount++;
    }

    const topTx = await pools.launchpad.query<{ launch_tx_hash: string }>(
      `
        SELECT launch_tx_hash FROM tokens
        WHERE is_hidden = false
        ORDER BY created_at DESC
        LIMIT 1
      `
    );
    const kingTx = (topTx.rows[0]?.launch_tx_hash ?? `0x${"0".repeat(64)}`) as Hash;
    await recomputeKing({ launchpadPool: pools.launchpad }, new Date(), kingTx);

    console.log(
      `Mission sync complete: deploy=${deployCount}, dailySwap=${swapCount}, smartBuy=${smartBuyCount}, invited=${invitedCount}, volumeMonster=${volumeCount}, kingHistory=recomputed`
    );
    console.log("Refresh /missions in the TMA.");
  } finally {
    await closePools(pools);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
