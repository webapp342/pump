/**
 * Launchpad PDAs + account layouts matching programs/pump-launchpad.
 * Decoders use Uint8Array/DataView — safe in browser (no Node Buffer.read*).
 */

import { PublicKey } from "@solana/web3.js";
import { PDA_SEEDS, PROGRAM_IDS } from "@pump/solana-sdk";

export function launchpadProgramId(): PublicKey {
  return new PublicKey(PROGRAM_IDS.launchpad);
}

export function pdaGlobal(programId = launchpadProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.global)],
    programId
  );
}

export function pdaFactorySigner(programId = launchpadProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.factorySigner)],
    programId
  );
}

export function pdaTreasuryVault(programId = launchpadProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.vault)],
    programId
  );
}

export function pdaCurve(
  mint: PublicKey,
  programId = launchpadProgramId()
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.curve), mint.toBuffer()],
    programId
  );
}

export function pdaReferrerBinding(
  trader: PublicKey,
  programId = launchpadProgramId()
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.referrer), trader.toBuffer()],
    programId
  );
}

function readBigUInt64LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function readUInt8(data: Uint8Array, offset: number): number {
  return data[offset] ?? 0;
}

/** On-chain Curve account layout (bytemuck Pod). */
export type OnchainCurve = {
  mint: PublicKey;
  creator: PublicKey;
  tokenVault: PublicKey;
  reserveSol: bigint;
  soldTokens: bigint;
  virtualSolReserve: bigint;
  virtualTokenReserve: bigint;
  totalSupply: bigint;
  paused: number;
  bump: number;
};

export function decodeCurveAccount(data: Uint8Array): OnchainCurve {
  if (data.length < 144) {
    throw new Error("Curve account too small");
  }
  let o = 0;
  const readPk = () => {
    const pk = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return pk;
  };
  const readU64 = () => {
    const v = readBigUInt64LE(data, o);
    o += 8;
    return v;
  };
  const mint = readPk();
  const creator = readPk();
  const tokenVault = readPk();
  const reserveSol = readU64();
  const soldTokens = readU64();
  const virtualSolReserve = readU64();
  const virtualTokenReserve = readU64();
  const totalSupply = readU64();
  const paused = readUInt8(data, o);
  o += 1;
  const bump = readUInt8(data, o);
  return {
    mint,
    creator,
    tokenVault,
    reserveSol,
    soldTokens,
    virtualSolReserve,
    virtualTokenReserve,
    totalSupply,
    paused,
    bump,
  };
}

/** GlobalConfig layout — matches programs/pump-launchpad GlobalConfig. */
export type OnchainGlobal = {
  protocolFeeBps: bigint;
  creatorFeeShareBps: bigint;
  referrerShareBps: bigint;
  createFeeLamports: bigint;
  tokenDecimals: number;
  emergencyHalt: number;
};

export function decodeGlobalConfig(data: Uint8Array): OnchainGlobal {
  if (data.length < 162) {
    throw new Error("Global account too small");
  }
  const protocolFeeBps = readBigUInt64LE(data, 96);
  const creatorFeeShareBps = readBigUInt64LE(data, 104);
  const referrerShareBps = readBigUInt64LE(data, 112);
  const createFeeLamports = readBigUInt64LE(data, 128);
  const tokenDecimals = readUInt8(data, 160) || 6;
  const emergencyHalt = readUInt8(data, 161);
  return {
    protocolFeeBps,
    creatorFeeShareBps,
    referrerShareBps,
    createFeeLamports,
    tokenDecimals,
    emergencyHalt,
  };
}
