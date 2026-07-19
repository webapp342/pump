/**
 * Self-test: encode a synthetic TradeEvent and decode via discriminator path.
 * Run: npm run test:decode -w @pump/indexer-sol
 */
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { CURVE_EVENTS } from "@pump/solana-sdk";
import { decodeProgramData, extractEventsFromLogs } from "./decode.js";
import { executionPriceSol, lamportsToSol, spotPriceSolPerToken } from "./units.js";

function disc(name: string): Buffer {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
}

function writeU64(buf: Buffer, offset: number, v: bigint): number {
  buf.writeBigUInt64LE(v, offset);
  return offset + 8;
}

function encodeTradeEvent(fields: {
  mint: Uint8Array;
  trader: Uint8Array;
  isBuy: boolean;
  solAmount: bigint;
  tokenAmount: bigint;
  feeLamports: bigint;
  reserveSol: bigint;
  soldTokens: bigint;
  spotPrice: bigint;
}): string {
  const body = Buffer.alloc(32 + 32 + 1 + 8 * 6);
  let o = 0;
  body.set(fields.mint, o);
  o += 32;
  body.set(fields.trader, o);
  o += 32;
  body.writeUInt8(fields.isBuy ? 1 : 0, o);
  o += 1;
  o = writeU64(body, o, fields.solAmount);
  o = writeU64(body, o, fields.tokenAmount);
  o = writeU64(body, o, fields.feeLamports);
  o = writeU64(body, o, fields.reserveSol);
  o = writeU64(body, o, fields.soldTokens);
  writeU64(body, o, fields.spotPrice);
  return Buffer.concat([disc(CURVE_EVENTS.TradeEvent), body]).toString("base64");
}

const mint = Keypair.generate().publicKey.toBytes();
const trader = Keypair.generate().publicKey.toBytes();
const b64 = encodeTradeEvent({
  mint,
  trader,
  isBuy: true,
  solAmount: 1_000_000_000n,
  tokenAmount: 50_000_000n,
  feeLamports: 10_000_000n,
  reserveSol: 1_000_000_000n,
  soldTokens: 50_000_000n,
  spotPrice: 30_000n,
});

const decoded = decodeProgramData(b64);
if (!decoded || decoded.name !== CURVE_EVENTS.TradeEvent) {
  throw new Error(`expected TradeEvent, got ${decoded?.name}`);
}
if (decoded.fields.isBuy !== true) throw new Error("isBuy");
if (decoded.fields.solAmount !== 1_000_000_000n) throw new Error("solAmount");
if (bs58.encode(mint) !== decoded.fields.mint) throw new Error("mint mismatch");

const fromLogs = extractEventsFromLogs({
  logs: [`Program data: ${b64}`],
  signature: "TestSig111",
  slot: 42,
  programId: "curve",
});
if (fromLogs.length !== 1 || fromLogs[0].handler !== "onTrade") {
  throw new Error("extractEventsFromLogs failed");
}

const price = executionPriceSol(1_000_000_000n, 50_000_000n, 6);
const spot = spotPriceSolPerToken(30_000n, 6);
console.log("decode.selftest OK", {
  mint: decoded.fields.mint,
  sol: lamportsToSol(1_000_000_000n),
  executionPrice: price,
  spot,
});
