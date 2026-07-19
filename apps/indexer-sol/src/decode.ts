import { createHash } from "node:crypto";
import bs58 from "bs58";
import {
  CURVE_EVENTS,
  EVENT_TO_HANDLER,
  FACTORY_EVENTS,
  TREASURY_EVENTS,
  type SolanaHandlerName,
} from "@pump/solana-sdk";

export type DecodedSolanaEvent = {
  name: string;
  handler: SolanaHandlerName | null;
  dataBase64: string;
  /** Borsh-decoded fields when discriminator matched. */
  fields: Record<string, unknown> | null;
  signature: string;
  slot: number;
  programId: string;
  /** Index among Program data lines in this log batch (trade uniqueness). */
  logIndex: number;
};

type Reader = { buf: Buffer; offset: number };

function eventDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
}

const DISC_TO_NAME: Map<string, string> = (() => {
  const names = [
    FACTORY_EVENTS.TokenCreated,
    CURVE_EVENTS.TokenRegistered,
    CURVE_EVENTS.TradeEvent,
    CURVE_EVENTS.FeeSplitEvent,
    CURVE_EVENTS.ReferrerSetEvent,
    CURVE_EVENTS.FeesClaimed,
    TREASURY_EVENTS.TreasuryWithdraw,
  ];
  const map = new Map<string, string>();
  for (const name of names) {
    map.set(eventDiscriminator(name).toString("hex"), name);
  }
  return map;
})();

function readPubkey(r: Reader): string {
  const slice = r.buf.subarray(r.offset, r.offset + 32);
  r.offset += 32;
  return bs58.encode(slice);
}

function readU64(r: Reader): bigint {
  const v = r.buf.readBigUInt64LE(r.offset);
  r.offset += 8;
  return v;
}

function readU8(r: Reader): number {
  const v = r.buf.readUInt8(r.offset);
  r.offset += 1;
  return v;
}

function readBool(r: Reader): boolean {
  return readU8(r) !== 0;
}

function readString(r: Reader): string {
  const len = r.buf.readUInt32LE(r.offset);
  r.offset += 4;
  const s = r.buf.subarray(r.offset, r.offset + len).toString("utf8");
  r.offset += len;
  return s;
}

function decodeFields(name: string, body: Buffer): Record<string, unknown> {
  const r: Reader = { buf: body, offset: 0 };
  switch (name) {
    case FACTORY_EVENTS.TokenCreated:
      return {
        mint: readPubkey(r),
        creator: readPubkey(r),
        name: readString(r),
        symbol: readString(r),
        uri: readString(r),
        totalSupply: readU64(r),
        virtualSolReserve: readU64(r),
        decimals: readU8(r),
      };
    case CURVE_EVENTS.TokenRegistered:
      return {
        mint: readPubkey(r),
        creator: readPubkey(r),
        totalSupply: readU64(r),
        virtualSolReserve: readU64(r),
        virtualTokenReserve: readU64(r),
      };
    case CURVE_EVENTS.TradeEvent:
      return {
        mint: readPubkey(r),
        trader: readPubkey(r),
        isBuy: readBool(r),
        solAmount: readU64(r),
        tokenAmount: readU64(r),
        feeLamports: readU64(r),
        reserveSol: readU64(r),
        soldTokens: readU64(r),
        spotPrice: readU64(r),
      };
    case CURVE_EVENTS.FeeSplitEvent:
      return {
        mint: readPubkey(r),
        creator: readPubkey(r),
        creatorFee: readU64(r),
        referrerFee: readU64(r),
        treasuryFee: readU64(r),
      };
    case CURVE_EVENTS.ReferrerSetEvent:
      return {
        trader: readPubkey(r),
        referrer: readPubkey(r),
      };
    case CURVE_EVENTS.FeesClaimed:
      return {
        owner: readPubkey(r),
        amount: readU64(r),
      };
    case TREASURY_EVENTS.TreasuryWithdraw:
      return {
        to: readPubkey(r),
        amount: readU64(r),
      };
    default:
      return {};
  }
}

/** Decode one Anchor `Program data:` base64 blob. Returns null if unknown disc. */
export function decodeProgramData(
  dataBase64: string
): { name: string; fields: Record<string, unknown> } | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(dataBase64, "base64");
  } catch {
    return null;
  }
  if (buf.length < 8) return null;
  const name = DISC_TO_NAME.get(buf.subarray(0, 8).toString("hex"));
  if (!name) return null;
  try {
    return { name, fields: decodeFields(name, buf.subarray(8)) };
  } catch (err) {
    console.warn(`[indexer-sol] borsh decode failed for ${name}:`, err);
    return null;
  }
}

export function extractEventsFromLogs(input: {
  logs: string[];
  signature: string;
  slot: number;
  programId: string;
}): DecodedSolanaEvent[] {
  const out: DecodedSolanaEvent[] = [];
  let logIndex = 0;

  for (const line of input.logs) {
    const dataMatch = /^Program data:\s*(\S+)$/.exec(line);
    if (!dataMatch) continue;

    const dataBase64 = dataMatch[1];
    const decoded = decodeProgramData(dataBase64);
    if (!decoded) continue;

    const handler =
      decoded.name in EVENT_TO_HANDLER
        ? EVENT_TO_HANDLER[decoded.name as keyof typeof EVENT_TO_HANDLER]
        : null;

    out.push({
      name: decoded.name,
      handler,
      dataBase64,
      fields: decoded.fields,
      signature: input.signature,
      slot: input.slot,
      programId: input.programId,
      logIndex: logIndex++,
    });
  }

  return out;
}

/** Exported for unit tests / tooling. */
export function eventDiscHex(name: string): string {
  return eventDiscriminator(name).toString("hex");
}
