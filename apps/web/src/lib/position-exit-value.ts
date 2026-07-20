import { formatEther, parseUnits } from "viem";
import {
  bondingCurveFromSnapshot,
  quoteSellFromCurveState,
  type BondingCurveSnapshot,
} from "@/lib/bonding-curve";
import { isEmptyCurveSnapshot, machineFromTokenReserves } from "@/lib/bonding-curve-state";
import {
  bnbToUsd,
  positionUnrealizedPct,
  positionUnrealizedUsd,
  resolveOpenLotCostUsd,
} from "@/lib/format-usd";

export type OpenLotUnrealizedPnl = {
  usd: number | null;
  pct: number | null;
};

/** DB bonding_state decimals → snapshot for sell-all P/L quotes. */
export function bondingSnapshotFromDbBondingState(
  reserveBnb: string,
  tokenSold: string,
  virtualZugReserveHuman?: string | number | null,
  virtualTokenReserveHuman?: string | number | null,
  paused = false
): BondingCurveSnapshot {
  const virtualZugWei =
    virtualZugReserveHuman != null && String(virtualZugReserveHuman).trim() !== ""
      ? parseUnits(String(virtualZugReserveHuman), 18).toString()
      : undefined;
  const virtualTokenWei =
    virtualTokenReserveHuman != null && String(virtualTokenReserveHuman).trim() !== ""
      ? parseUnits(String(virtualTokenReserveHuman), 18).toString()
      : undefined;

  return machineFromTokenReserves(
    reserveBnb,
    tokenSold,
    paused,
    0,
    virtualZugWei,
    virtualTokenWei
  ).snapshot;
}

/**
 * Unrealized P/L — prefers sell-all curve quote (max sell) over spot × balance.
 * Falls back to spot mark when curve snapshot is unavailable.
 */
export function computeOpenLotUnrealizedPnl(
  balanceTokens: number,
  remainingCostBasisUsd: number,
  remainingCostBasisBnb: number,
  liveBnbUsd: number | null | undefined,
  spotPriceBnb: number,
  curveSnapshot?: BondingCurveSnapshot | null,
  protocolFeeBps?: bigint
): OpenLotUnrealizedPnl {
  const canExitQuote =
    curveSnapshot &&
    protocolFeeBps != null &&
    !isEmptyCurveSnapshot(curveSnapshot);

  if (canExitQuote) {
    const exitBnb = positionExitValueBnb(balanceTokens, curveSnapshot, protocolFeeBps);
    if (exitBnb > 0) {
      const usd = positionUnrealizedUsdFromExit(
        exitBnb,
        remainingCostBasisUsd,
        remainingCostBasisBnb,
        liveBnbUsd
      );
      const pct = positionUnrealizedPctFromExit(
        usd,
        remainingCostBasisUsd,
        remainingCostBasisBnb,
        liveBnbUsd
      );
      return { usd, pct };
    }
  }

  const usd = positionUnrealizedUsd(
    balanceTokens,
    spotPriceBnb,
    remainingCostBasisUsd,
    remainingCostBasisBnb,
    liveBnbUsd
  );
  const pct = positionUnrealizedPct(
    usd,
    remainingCostBasisUsd,
    remainingCostBasisBnb,
    liveBnbUsd
  );
  return { usd, pct };
}

/** Human token balance → 18-dec wei (no float drift on large balances). */
export function tokenBalanceHumanToWei(balance: number): bigint {
  if (!Number.isFinite(balance) || balance <= 0) return 0n;
  const normalized = balance.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 18,
  });
  try {
    return parseUnits(normalized, 18);
  } catch {
    return 0n;
  }
}

/**
 * Native SOL/BNB received if holder sold `balanceTokens` now on the bonding curve.
 * Honest holder/portfolio value — not spot × balance (overstates large positions).
 */
export function positionExitValueBnb(
  balanceTokens: number,
  snapshot: BondingCurveSnapshot,
  protocolFeeBps: bigint
): number {
  const tokenIn = tokenBalanceHumanToWei(balanceTokens);
  if (tokenIn <= 0n) return 0;
  const curve = bondingCurveFromSnapshot(snapshot);
  const { ethOut } = quoteSellFromCurveState(curve, protocolFeeBps, tokenIn);
  const out = Number(formatEther(ethOut));
  return Number.isFinite(out) && out > 0 ? out : 0;
}

/** Unrealized P/L vs exit quote (what you'd get selling now), not marginal spot mark. */
export function positionUnrealizedUsdFromExit(
  exitValueBnb: number,
  remainingCostBasisUsd: number,
  remainingCostBasisBnb: number,
  liveBnbUsd: number | null | undefined
): number | null {
  const exitUsd = bnbToUsd(exitValueBnb, liveBnbUsd);
  if (exitUsd == null) return null;
  const costUsd = resolveOpenLotCostUsd(
    remainingCostBasisUsd,
    remainingCostBasisBnb,
    liveBnbUsd
  );
  if (costUsd == null) return null;
  return exitUsd - costUsd;
}

export function positionUnrealizedPctFromExit(
  unrealizedUsd: number | null,
  remainingCostBasisUsd: number,
  remainingCostBasisBnb: number,
  liveBnbUsd: number | null | undefined
): number | null {
  const costUsd = resolveOpenLotCostUsd(
    remainingCostBasisUsd,
    remainingCostBasisBnb,
    liveBnbUsd
  );
  if (unrealizedUsd == null || costUsd == null || costUsd <= 0) return null;
  return (unrealizedUsd / costUsd) * 100;
}
