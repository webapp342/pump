import type pg from "pg";

export const TASK_KEYS = {
  dailySwap: "LAUNCHPAD_DAILY_SWAP",
  deployMeme: "LAUNCHPAD_DEPLOY_MEME",
  firstSmartBuy: "LAUNCHPAD_FIRST_SMART_BUY",
  volumeMonster: "LAUNCHPAD_VOLUME_MONSTER",
} as const;

type AwardInput = {
  address: string;
  taskKey: string;
  eventId: string;
  txHash: string;
  blockTime: Date;
  metadata?: Record<string, unknown>;
  daily?: boolean;
};

function blockDate(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 10);
}

/**
 * Award launchpad mission points on the same pump_db the Solana indexer writes.
 * Addresses and Solana tx signatures keep their canonical case (no lowercasing).
 */
export class PointsBridge {
  constructor(private readonly pool: pg.Pool) {}

  async award(input: AwardInput): Promise<void> {
    try {
      await this.pool.query(
        `
          SELECT *
          FROM launchpad_award_points($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          input.address,
          input.taskKey,
          `${input.taskKey}:${input.eventId}`,
          input.txHash,
          input.daily ? blockDate(input.blockTime) : null,
          JSON.stringify(input.metadata ?? {}),
        ]
      );
    } catch (err) {
      console.error(
        `[indexer-sol] points award failed task=${input.taskKey} addr=${input.address}`,
        err
      );
    }
  }
}
