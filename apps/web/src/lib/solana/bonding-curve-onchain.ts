/**
 * Map on-chain Curve account → BondingCurveState for quoteBuy (pump.fun virtual math).
 */
import type { BondingCurveState } from "@/lib/bonding-curve";
import { lamportsToWei, tokenRawToWei } from "@/lib/solana/amount-scale";
import type { OnchainCurve } from "@/lib/solana/launchpad-pdas";

export function bondingCurveStateFromOnchainCurve(
  curve: OnchainCurve,
  vaultTokenRaw = 0n
): BondingCurveState {
  return {
    reserveZug: 0n,
    soldTokens: 0n,
    virtualZugReserve: lamportsToWei(curve.virtualSolReserves),
    virtualTokenReserve: tokenRawToWei(curve.virtualTokenReserves),
    realTokenReserves: tokenRawToWei(curve.realTokenReserves),
    realSolReserves: lamportsToWei(curve.realSolReserves),
    complete: curve.complete !== 0,
    vaultTokenReserves: tokenRawToWei(vaultTokenRaw),
  };
}
