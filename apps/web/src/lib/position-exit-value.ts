import { formatEther, parseUnits } from "viem";
import {
  bondingCurveFromSnapshot,
  quoteSellFromCurveState,
  type BondingCurveSnapshot,
} from "@/lib/bonding-curve";
import {
  bnbToUsd,
  resolveOpenLotCostUsd,
} from "@/lib/format-usd";

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
