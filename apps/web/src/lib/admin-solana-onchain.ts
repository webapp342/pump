/**
 * Solana admin protocol snapshot — Base LaunchpadTreasury / BondingCurveManager parity.
 */

import { PublicKey } from "@solana/web3.js";
import { NATIVE_DECIMALS, PROGRAM_IDS } from "@pump/solana-sdk";
import { getSolanaConnection } from "@/lib/solana/transfer";
import {
  decodeGlobalConfig,
  launchpadProgramId,
  pdaGlobal,
  withdrawableLamports,
} from "@/lib/solana/launchpad-pdas";

function formatSol(lamports: bigint): string {
  const base = 10n ** BigInt(NATIVE_DECIMALS);
  const whole = lamports / base;
  const frac = (lamports % base).toString().padStart(NATIVE_DECIMALS, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
}

export async function getAdminProtocolSnapshotSolana() {
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const conn = getSolanaConnection();
  const info = await conn.getAccountInfo(globalPda, "confirmed");
  if (!info?.data) {
    throw new Error(
      `Solana Global not initialized (${globalPda.toBase58()}). Run npm run solana:initialize.`
    );
  }

  const g = decodeGlobalConfig(info.data);
  const [liquidityLamports, protocolLamports] = await Promise.all([
    conn.getBalance(g.liquidity, "confirmed"),
    conn.getBalance(g.protocolTreasury, "confirmed"),
  ]);

  const liquidityBal = BigInt(liquidityLamports);
  const protocolBal = BigInt(protocolLamports);
  const program = programId.toBase58();
  const authority = g.authority.toBase58();
  const liquidity = g.liquidity.toBase58();
  const protocolTreasury = g.protocolTreasury.toBase58();

  return {
    memeFactory: {
      address: program,
      owner: authority,
      treasury: protocolTreasury,
      createFeeBnb: formatSol(g.createFeeLamports),
      minInitialBuyBnb: "0",
    },
    bondingCurveManager: {
      address: program,
      owner: authority,
      treasury: protocolTreasury,
      protocolFeeBps: Number(g.protocolFeeBps),
      creatorFeeShareBps: Number(g.creatorFeeShareBps),
      referrerShareBps: Number(g.referrerShareBps),
      /** Shared liquidity vault balance (curve SOL + pending claimable fees). */
      contractBalanceBnb: formatSol(liquidityBal),
      emergencyHalt: g.emergencyHalt !== 0,
      liquidityVault: liquidity,
      withdrawableLiquiditySol: formatSol(withdrawableLamports(liquidityBal)),
      withdrawableProtocolSol: formatSol(withdrawableLamports(protocolBal)),
    },
    airdropManager: null,
    treasury: {
      address: protocolTreasury,
      owner: authority,
      balanceBnb: formatSol(protocolBal),
    },
    solana: {
      programId: program,
      globalPda: globalPda.toBase58(),
      authority,
      liquidityVault: liquidity,
      protocolTreasury,
      factorySigner: g.factorySigner.toBase58(),
      configuredProgramId: PROGRAM_IDS.launchpad,
    },
  };
}

export function isValidSolanaAddress(value: string): boolean {
  try {
    // Accept any valid base58 pubkey encoding (system / PDA / wallet).
    new PublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}
