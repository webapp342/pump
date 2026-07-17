import type { Hash } from "viem";
import { config } from "./config.js";
import { closePools, createPools } from "./db.js";
import { getTopMcapToken, recomputeKing } from "./king.js";

/** One-off backfill for king_history when #1 bonding token is already clear. */
async function main(): Promise<void> {
  const pools = createPools(config.launchpadDatabaseUrl, config.vm1MainDatabaseUrl);

  try {
    const top = await getTopMcapToken(pools.launchpad);
    if (!top) {
      console.log("No bonding tokens found — nothing to sync.");
      return;
    }

    const txResult = await pools.launchpad.query<{ launch_tx_hash: string }>(
      "SELECT launch_tx_hash FROM tokens WHERE address = $1",
      [top.tokenAddress]
    );
    const txHash = (txResult.rows[0]?.launch_tx_hash ?? "0x" + "0".repeat(64)) as Hash;

    console.log(
      `Current #1: ${top.tokenAddress} (creator ${top.creatorAddress}, mcap ${top.marketCapBnb} BNB)`
    );

    await recomputeKing({ launchpadPool: pools.launchpad }, new Date(), txHash);

    console.log("King history sync complete.");
  } finally {
    await closePools(pools);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
