/** PDA seeds — must match programs/pump-launchpad/src/lib.rs. */
export const PDA_SEEDS = {
  global: "global",
  curve: "curve",
  vault: "vault",
  factorySigner: "factory-signer",
  referrer: "referrer",
  pendingFees: "pending-fees",
  trader: "trader",
} as const;

/**
 * Pinocchio launchpad (single program). Deployed keypair under
 * `programs/pump-launchpad/keys/pump_launchpad-keypair.json`.
 */
export const PROGRAM_IDS = {
  /** Unified factory + curve + treasury */
  launchpad: "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus",
  /** @deprecated use launchpad */
  factory: "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus",
  /** @deprecated use launchpad */
  curve: "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus",
  /** @deprecated use launchpad */
  treasury: "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus",
} as const;

/** Pinocchio instruction tags (1 byte). */
export const IX = {
  initialize: 0,
  createMeme: 1,
  buy: 2,
  sell: 3,
  withdrawTreasury: 4,
  setReferrer: 5,
} as const;

export type SolanaCluster = "localnet" | "devnet" | "mainnet-beta";

export const NATIVE_SYMBOL = "SOL" as const;
export const NATIVE_DECIMALS = 9 as const;

export const SOLANA_DB_CHAIN_ID: Record<SolanaCluster, number> = {
  localnet: 901_100,
  devnet: 901_103,
  "mainnet-beta": 901_101,
};

export const DEFAULT_CLUSTER: SolanaCluster = "devnet";

export const SPOT_PRICE_TOKEN_UNIT = 1_000_000_000n;

export const CLUSTER_RPC: Record<SolanaCluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export function resolveSolanaCluster(
  raw: string | undefined | null
): SolanaCluster {
  const v = (raw ?? DEFAULT_CLUSTER).trim().toLowerCase();
  if (v === "localnet" || v === "local") return "localnet";
  if (v === "mainnet" || v === "mainnet-beta") return "mainnet-beta";
  return "devnet";
}

export function resolveSolanaRpcUrl(env?: {
  cluster?: string | null;
  rpcUrl?: string | null;
}): string {
  if (env?.rpcUrl?.trim()) return env.rpcUrl.trim();
  const cluster = resolveSolanaCluster(env?.cluster);
  return CLUSTER_RPC[cluster];
}

export type ProgramIdKey = keyof typeof PROGRAM_IDS;

export function programId(key: ProgramIdKey, override?: string | null): string {
  const o = override?.trim();
  return o && o.length > 0 ? o : PROGRAM_IDS[key];
}

export const PUMP_FEEL_DEFAULTS = {
  tokenDecimals: 6,
  totalSupply: 1_000_000_000_000_000n,
  virtualSolLamports: 30_000_000_000n,
  createFeeLamports: 0n,
  protocolFeeBps: 100,
  creatorFeeShareBps: 5_000,
  referrerShareBps: 1_000,
  verifiedReferrerShareBps: 2_000,
} as const;

export type PumpFeelDefaults = typeof PUMP_FEEL_DEFAULTS;

export function pumpFeelVirtualTokenReserve(
  defaults: PumpFeelDefaults = PUMP_FEEL_DEFAULTS
): bigint {
  return defaults.totalSupply;
}

/** Encode Pinocchio `initialize` instruction data (tag + 8×u64 + u8). */
export function encodeInitializeIx(defaults: PumpFeelDefaults = PUMP_FEEL_DEFAULTS): Buffer {
  const buf = Buffer.alloc(1 + 64 + 1);
  buf.writeUInt8(IX.initialize, 0);
  let o = 1;
  const writeU64 = (v: number | bigint) => {
    buf.writeBigUInt64LE(BigInt(v), o);
    o += 8;
  };
  writeU64(defaults.protocolFeeBps);
  writeU64(defaults.creatorFeeShareBps);
  writeU64(defaults.referrerShareBps);
  writeU64(defaults.verifiedReferrerShareBps);
  writeU64(defaults.createFeeLamports);
  writeU64(defaults.virtualSolLamports);
  writeU64(defaults.totalSupply); // virtual token = supply
  writeU64(defaults.totalSupply);
  buf.writeUInt8(defaults.tokenDecimals, o);
  return buf;
}

export function encodeBuyIx(solInLamports: bigint, minTokenOut: bigint): Buffer {
  const buf = Buffer.alloc(17);
  buf.writeUInt8(IX.buy, 0);
  buf.writeBigUInt64LE(solInLamports, 1);
  buf.writeBigUInt64LE(minTokenOut, 9);
  return buf;
}

export function encodeSellIx(tokenIn: bigint, minSolOut: bigint): Buffer {
  const buf = Buffer.alloc(17);
  buf.writeUInt8(IX.sell, 0);
  buf.writeBigUInt64LE(tokenIn, 1);
  buf.writeBigUInt64LE(minSolOut, 9);
  return buf;
}

export function encodeCreateMemeIx(input: {
  name: string;
  symbol: string;
  uri?: string;
}): Buffer {
  const nameBytes = Buffer.from(input.name.trim(), "utf8");
  const symbolBytes = Buffer.from(input.symbol.trim().toUpperCase(), "utf8");
  const uriBytes = Buffer.from((input.uri ?? "").trim(), "utf8");

  if (!nameBytes.length || nameBytes.length > 64) {
    throw new Error("Token name must be 1–64 bytes");
  }
  if (!symbolBytes.length || symbolBytes.length > 16) {
    throw new Error("Token symbol must be 1–16 bytes");
  }
  if (uriBytes.length > 256) {
    throw new Error("Metadata URI must be at most 256 bytes");
  }

  const buf = Buffer.alloc(
    1 + 4 + nameBytes.length + 4 + symbolBytes.length + 4 + uriBytes.length
  );
  let o = 0;
  buf.writeUInt8(IX.createMeme, o);
  o += 1;

  const writeString = (value: Buffer) => {
    buf.writeUInt32LE(value.length, o);
    o += 4;
    value.copy(buf, o);
    o += value.length;
  };

  writeString(nameBytes);
  writeString(symbolBytes);
  writeString(uriBytes);
  return buf;
}

export function encodeWithdrawIx(amount: bigint): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(IX.withdrawTreasury, 0);
  buf.writeBigUInt64LE(amount, 1);
  return buf;
}

export function encodeSetReferrerIx(): Buffer {
  return Buffer.from([IX.setReferrer]);
}

export {
  FACTORY_EVENTS,
  CURVE_EVENTS,
  TREASURY_EVENTS,
  EVENT_TO_HANDLER,
} from "./events.js";
export type {
  FactoryEventName,
  CurveEventName,
  TreasuryEventName,
  SolanaHandlerName,
} from "./events.js";

export function shortSolanaAddress(address: string, compact = false): string {
  if (address.length < 8) return address;
  if (compact) return `${address.slice(0, 4)}...${address.slice(-4)}`;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
