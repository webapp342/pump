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

function writeU8(out: Uint8Array, offset: number, value: number): number {
  out[offset] = value & 0xff;
  return offset + 1;
}

function writeU32Le(out: Uint8Array, offset: number, value: number): number {
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(offset, value, true);
  return offset + 4;
}

function writeU64Le(out: Uint8Array, offset: number, value: bigint): number {
  new DataView(out.buffer, out.byteOffset, out.byteLength).setBigUint64(offset, value, true);
  return offset + 8;
}

function writeBytes(out: Uint8Array, offset: number, chunk: Uint8Array): number {
  out.set(chunk, offset);
  return offset + chunk.length;
}

function writeBorshBytes(out: Uint8Array, offset: number, bytes: Uint8Array): number {
  let o = writeU32Le(out, offset, bytes.length);
  o = writeBytes(out, o, bytes);
  return o;
}

/** Encode Pinocchio `initialize` instruction data (tag + 8×u64 + u8). */
export function encodeInitializeIx(defaults: PumpFeelDefaults = PUMP_FEEL_DEFAULTS): Uint8Array {
  const out = new Uint8Array(1 + 64 + 1);
  let o = writeU8(out, 0, IX.initialize);
  o = writeU64Le(out, o, BigInt(defaults.protocolFeeBps));
  o = writeU64Le(out, o, BigInt(defaults.creatorFeeShareBps));
  o = writeU64Le(out, o, BigInt(defaults.referrerShareBps));
  o = writeU64Le(out, o, BigInt(defaults.verifiedReferrerShareBps));
  o = writeU64Le(out, o, defaults.createFeeLamports);
  o = writeU64Le(out, o, defaults.virtualSolLamports);
  o = writeU64Le(out, o, defaults.totalSupply);
  o = writeU64Le(out, o, defaults.totalSupply);
  writeU8(out, o, defaults.tokenDecimals);
  return out;
}

export function encodeBuyIx(solInLamports: bigint, minTokenOut: bigint): Uint8Array {
  const out = new Uint8Array(17);
  let o = writeU8(out, 0, IX.buy);
  o = writeU64Le(out, o, solInLamports);
  writeU64Le(out, o, minTokenOut);
  return out;
}

export function encodeSellIx(tokenIn: bigint, minSolOut: bigint): Uint8Array {
  const out = new Uint8Array(17);
  let o = writeU8(out, 0, IX.sell);
  o = writeU64Le(out, o, tokenIn);
  writeU64Le(out, o, minSolOut);
  return out;
}

export function encodeCreateMemeIx(input: {
  name: string;
  symbol: string;
  uri?: string;
}): Uint8Array {
  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();
  const uri = (input.uri ?? "").trim();
  const nameBytes = new TextEncoder().encode(name);
  const symbolBytes = new TextEncoder().encode(symbol);
  const uriBytes = new TextEncoder().encode(uri);

  if (!nameBytes.length || nameBytes.length > 64) {
    throw new Error("Token name must be 1–64 bytes");
  }
  if (!symbolBytes.length || symbolBytes.length > 16) {
    throw new Error("Token symbol must be 1–16 bytes");
  }
  if (uriBytes.length > 256) {
    throw new Error("Metadata URI must be at most 256 bytes");
  }

  const out = new Uint8Array(
    1 + 4 + nameBytes.length + 4 + symbolBytes.length + 4 + uriBytes.length
  );
  let o = writeU8(out, 0, IX.createMeme);
  o = writeBorshBytes(out, o, nameBytes);
  o = writeBorshBytes(out, o, symbolBytes);
  writeBorshBytes(out, o, uriBytes);
  return out;
}

export function encodeWithdrawIx(amount: bigint): Uint8Array {
  const out = new Uint8Array(9);
  let o = writeU8(out, 0, IX.withdrawTreasury);
  writeU64Le(out, o, amount);
  return out;
}

export function encodeSetReferrerIx(): Uint8Array {
  return new Uint8Array([IX.setReferrer]);
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
