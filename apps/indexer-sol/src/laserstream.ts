import { Connection, PublicKey, type Logs } from "@solana/web3.js";
import type { IndexerSolConfig } from "./config.js";

export type SolanaLogBatch = {
  signature: string;
  slot: number;
  logs: string[];
  programId: string;
  err: unknown;
};

export type LogBatchHandler = (batch: SolanaLogBatch) => Promise<void>;

export interface EventSource {
  readonly name: string;
  start(onBatch: LogBatchHandler): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Dev/default: websocket logs for factory + curve (+ treasury).
 * Sufficient until LaserStream credentials are wired.
 */
export class RpcLogsSource implements EventSource {
  readonly name = "rpc";
  private subs: number[] = [];
  private connection: Connection;

  constructor(
    private readonly config: IndexerSolConfig,
    connection?: Connection
  ) {
    this.connection = connection ?? new Connection(config.rpcUrl, "confirmed");
  }

  async start(onBatch: LogBatchHandler): Promise<void> {
    const programs = [
      this.config.factoryProgramId,
      this.config.curveProgramId,
      this.config.treasuryProgramId,
    ];

    for (const programId of programs) {
      const pk = new PublicKey(programId);
      const id = this.connection.onLogs(
        pk,
        (logs: Logs, ctx) => {
          void onBatch({
            signature: logs.signature,
            slot: ctx.slot,
            logs: logs.logs,
            programId,
            err: logs.err,
          });
        },
        "confirmed"
      );
      this.subs.push(id);
    }

    console.log(
      `[indexer-sol] RpcLogsSource subscribed programs=${programs.join(",")}`
    );
  }

  async stop(): Promise<void> {
    for (const id of this.subs) {
      await this.connection.removeOnLogsListener(id);
    }
    this.subs = [];
  }
}

/**
 * Production target: Helius LaserStream / Yellowstone gRPC.
 * Stub until HELIUS_LASERSTREAM_ENDPOINT (+ API key) are configured and the
 * gRPC client dependency is added.
 */
export class LaserStreamSource implements EventSource {
  readonly name = "laserstream";

  constructor(private readonly config: IndexerSolConfig) {}

  async start(_onBatch: LogBatchHandler): Promise<void> {
    if (!this.config.laserstreamEndpoint) {
      throw new Error(
        "SOLANA_INDEXER_SOURCE=laserstream requires HELIUS_LASERSTREAM_ENDPOINT"
      );
    }
    throw new Error(
      "LaserStream client not wired yet — use SOLANA_INDEXER_SOURCE=rpc for now. " +
        `endpoint=${this.config.laserstreamEndpoint}`
    );
  }

  async stop(): Promise<void> {
    /* no-op until client exists */
  }
}

export function createEventSource(config: IndexerSolConfig): EventSource {
  if (config.source === "laserstream") {
    if (config.laserstreamEndpoint) {
      console.warn(
        "[indexer-sol] LaserStream endpoint configured but client not wired — falling back to RPC logs"
      );
    }
  }
  return new RpcLogsSource(config);
}
