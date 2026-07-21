/**
 * Launchpad PDAs + account layouts matching programs/pump-launchpad.
 * Liquidity model: Base BondingCurveManager parity (shared SOL vault + claimable fees).
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

/** Shared SOL liquidity vault (all curve reserves + pending claimable fees). */
export function pdaLiquidityVault(programId = launchpadProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.vault)],
    programId
  );
}

/** @deprecated use pdaLiquidityVault */
export function pdaTreasuryVault(programId = launchpadProgramId()): [PublicKey, number] {
  return pdaLiquidityVault(programId);
}

/** Protocol fee sink (Base LaunchpadTreasury analogue). */
export function pdaProtocolTreasury(programId = launchpadProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.protocolTreasury)],
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

export function pdaCreatorFees(
  creator: PublicKey,
  programId = launchpadProgramId()
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.creatorFees), creator.toBuffer()],
    programId
  );
}

export function pdaReferrerFees(
  referrer: PublicKey,
  programId = launchpadProgramId()
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.referrerFees), referrer.toBuffer()],
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

/** Keep rent-exempt floor on vault PDAs (matches programs/pump-launchpad). */
export const SOLANA_VAULT_RENT_LAMPORTS = 890_880n;

export type OnchainGlobal = {
  authority: PublicKey;
  liquidity: PublicKey;
  protocolTreasury: PublicKey;
  factorySigner: PublicKey;
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
  if (data.length < 208) {
    throw new Error("Global account too small");
  }
  // authority(32) + liquidity(32) + protocol_treasury(32) + factory_signer(32) = 128
  const authority = new PublicKey(data.subarray(0, 32));
  const liquidity = new PublicKey(data.subarray(32, 64));
  const protocolTreasury = new PublicKey(data.subarray(64, 96));
  const factorySigner = new PublicKey(data.subarray(96, 128));
  const protocolFeeBps = readBigUInt64LE(data, 128);
  const creatorFeeShareBps = readBigUInt64LE(data, 136);
  const referrerShareBps = readBigUInt64LE(data, 144);
  const createFeeLamports = readBigUInt64LE(data, 160);
  const initialVirtualSolReserves = readBigUInt64LE(data, 168);
  const initialVirtualTokenReserves = readBigUInt64LE(data, 176);
  const initialRealTokenReserves = readBigUInt64LE(data, 184);
  const tokenTotalSupply = readBigUInt64LE(data, 192);
  const tokenDecimals = readUInt8(data, 200) || 6;
  const emergencyHalt = readUInt8(data, 201);
  return {
    authority,
    liquidity,
    protocolTreasury,
    factorySigner,
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

export function withdrawableLamports(balance: bigint | number): bigint {
  const bal = typeof balance === "bigint" ? balance : BigInt(balance);
  return bal > SOLANA_VAULT_RENT_LAMPORTS ? bal - SOLANA_VAULT_RENT_LAMPORTS : 0n;
}

export type OnchainPendingFees = {
  owner: PublicKey;
  pendingLamports: bigint;
  bump: number;
};

export function decodePendingFees(data: Uint8Array): OnchainPendingFees {
  if (data.length < 48) {
    throw new Error("PendingFees account too small");
  }
  return {
    owner: new PublicKey(data.subarray(0, 32)),
    pendingLamports: readBigUInt64LE(data, 32),
    bump: readUInt8(data, 40),
  };
}

export type OnchainReferrerBinding = {
  trader: PublicKey;
  referrer: PublicKey;
  bump: number;
};

export function decodeReferrerBinding(data: Uint8Array): OnchainReferrerBinding {
  if (data.length < 65) {
    throw new Error("ReferrerBinding account too small");
  }
  return {
    trader: new PublicKey(data.subarray(0, 32)),
    referrer: new PublicKey(data.subarray(32, 64)),
    bump: readUInt8(data, 64),
  };
}
