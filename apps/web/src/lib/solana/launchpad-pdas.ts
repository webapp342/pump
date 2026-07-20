/**
 * Launchpad PDAs + account layouts matching programs/pump-launchpad.
 * Curve layout = pump.fun BondingCurve fields (+ vault pubkey). Decoders use Uint8Array/DataView.
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

/** On-chain Curve — pump.fun BondingCurve + token_vault. */
export type OnchainCurve = {
  mint: PublicKey;
  creator: PublicKey;
  tokenVault: PublicKey;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  initialRealTokenReserves: bigint;
  complete: number;
  paused: number;
  bump: number;
};

export function decodeCurveAccount(data: Uint8Array): OnchainCurve {
  if (data.length < 152) {
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
  const virtualTokenReserves = readU64();
  const virtualSolReserves = readU64();
  const realTokenReserves = readU64();
  const realSolReserves = readU64();
  const tokenTotalSupply = readU64();
  const initialRealTokenReserves = readU64();
  const complete = readUInt8(data, o);
  o += 1;
  const paused = readUInt8(data, o);
  o += 1;
  const bump = readUInt8(data, o);
  return {
    mint,
    creator,
    tokenVault,
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    initialRealTokenReserves,
    complete,
    paused,
    bump,
  };
}

/** GlobalConfig — pump.fun reserve fields + our fees. */
export type OnchainGlobal = {
  protocolFeeBps: bigint;
  creatorFeeShareBps: bigint;
  referrerShareBps: bigint;
  createFeeLamports: bigint;
  initialVirtualSolReserves: bigint;
  initialVirtualTokenReserves: bigint;
  initialRealTokenReserves: bigint;
  tokenTotalSupply: bigint;
  tokenDecimals: number;
  emergencyHalt: number;
};

export function decodeGlobalConfig(data: Uint8Array): OnchainGlobal {
  if (data.length < 176) {
    throw new Error("Global account too small");
  }
  // Skip authority(32) + treasury(32) + factory_signer(32) = 96
  const protocolFeeBps = readBigUInt64LE(data, 96);
  const creatorFeeShareBps = readBigUInt64LE(data, 104);
  const referrerShareBps = readBigUInt64LE(data, 112);
  // verified_referrer_share_bps @120
  const createFeeLamports = readBigUInt64LE(data, 128);
  const initialVirtualSolReserves = readBigUInt64LE(data, 136);
  const initialVirtualTokenReserves = readBigUInt64LE(data, 144);
  const initialRealTokenReserves = readBigUInt64LE(data, 152);
  const tokenTotalSupply = readBigUInt64LE(data, 160);
  const tokenDecimals = readUInt8(data, 168) || 6;
  const emergencyHalt = readUInt8(data, 169);
  return {
    protocolFeeBps,
    creatorFeeShareBps,
    referrerShareBps,
    createFeeLamports,
    initialVirtualSolReserves,
    initialVirtualTokenReserves,
    initialRealTokenReserves,
    tokenTotalSupply,
    tokenDecimals,
    emergencyHalt,
  };
}
