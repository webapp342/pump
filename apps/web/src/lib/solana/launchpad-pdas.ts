/**
 * Launchpad PDAs + account layouts matching programs/pump-launchpad.
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

export function decodeCurveAccount(data: Buffer): OnchainCurve {
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
    const v = data.readBigUInt64LE(o);
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
  const paused = data[o++];
  const bump = data[o++];
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
  tokenDecimals: number;
  emergencyHalt: number;
};

export function decodeGlobalConfig(data: Buffer): OnchainGlobal {
  if (data.length < 162) {
    throw new Error("Global account too small");
  }
  // 3×pubkey (96) + protocol_fee_bps at 96
  const protocolFeeBps = data.readBigUInt64LE(96);
  const tokenDecimals = data[160] ?? 6;
  const emergencyHalt = data[161] ?? 0;
  return { protocolFeeBps, tokenDecimals, emergencyHalt };
}
