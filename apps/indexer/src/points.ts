import pg from "pg";
import type { Hash } from "viem";
import { blockDate, dbAddress } from "./utils.js";

export const TASK_KEYS = {
  dailySwap: "LAUNCHPAD_DAILY_SWAP",
  deployMeme: "LAUNCHPAD_DEPLOY_MEME",
  firstSmartBuy: "LAUNCHPAD_FIRST_SMART_BUY",
  invitedFirstTrade: "LAUNCHPAD_INVITED_FIRST_TRADE",
  volumeMonster: "LAUNCHPAD_VOLUME_MONSTER"
} as const;

type AwardInput = {
  address: string;
  taskKey: string;
  eventId: string;
  txHash: Hash;
  blockTime: Date;
  metadata?: Record<string, unknown>;
  daily?: boolean;
};

export class PointsBridge {
  constructor(private readonly vm1Pool?: pg.Pool) {}

  async award(input: AwardInput): Promise<void> {
    if (!this.vm1Pool) return;

    await this.vm1Pool.query(
      `
        SELECT *
        FROM launchpad_award_points($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        dbAddress(input.address),
        input.taskKey,
        `${input.taskKey}:${input.eventId}`,
        input.txHash.toLowerCase(),
        input.daily ? blockDate(input.blockTime) : null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }
}
