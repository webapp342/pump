/** Minimal Anchor event decode for web API tx verification (mirrors indexer-sol). */
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { CURVE_EVENTS, FACTORY_EVENTS } from "@pump/solana-sdk";

function eventDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
}

const DISC_TO_NAME: Map<string, string> = (() => {
  const names = [FACTORY_EVENTS.TokenCreated, CURVE_EVENTS.TradeEvent];
  const map = new Map<string, string>();
  for (const name of names) {
    map.set(eventDiscriminator(name).toString("hex"), name);
  }
  return map;
})();

function readPubkey(r: { buf: Buffer; offset: number }): string {
  const slice = r.buf.subarray(r.offset, r.offset + 32);
  r.offset += 32;
  return bs58.encode(slice);
}

function readU64(r: { buf: Buffer; offset: number }): bigint {
  const v = r.buf.readBigUInt64LE(r.offset);
  r.offset += 8;
  return v;
}

function readU8(r: { buf: Buffer; offset: number }): number {
  const v = r.buf.readUInt8(r.offset);
  r.offset += 1;
  return v;
}

function readString(r: { buf: Buffer; offset: number }): string {
  const len = r.buf.readUInt32LE(r.offset);
  r.offset += 4;
  const s = r.buf.subarray(r.offset, r.offset + len).toString("utf8");
  r.offset += len;
  return s;
}

function decodeFields(name: string, body: Buffer): Record<string, unknown> {
  const r = { buf: body, offset: 0 };
  if (name === FACTORY_EVENTS.TokenCreated) {
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
  }
  return {};
}

export function extractEventsFromLogs(input: {
  logs: string[];
  signature: string;
  slot: number;
  programId: string;
}): Array<{ name: string; fields: Record<string, unknown> | null }> {
  const out: Array<{ name: string; fields: Record<string, unknown> | null }> = [];
  for (const line of input.logs) {
    const dataMatch = /^Program data:\s*(\S+)$/.exec(line);
    if (!dataMatch) continue;
    let buf: Buffer;
    try {
      buf = Buffer.from(dataMatch[1], "base64");
    } catch {
      continue;
    }
    if (buf.length < 8) continue;
    const name = DISC_TO_NAME.get(buf.subarray(0, 8).toString("hex"));
    if (!name) continue;
    try {
      out.push({ name, fields: decodeFields(name, buf.subarray(8)) });
    } catch {
      out.push({ name, fields: null });
    }
  }
  return out;
}
