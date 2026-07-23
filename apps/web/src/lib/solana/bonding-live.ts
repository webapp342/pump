/**
 * Build BondingCurveState from DB/WS live fields — no RPC (indexer is SSOT).
 */
import { parseUnits } from "viem";
import { PUMP_FEEL_DEFAULTS } from "@/config/solana";
import type { BondingCurveState } from "@/lib/bonding-curve";
import { lamportsToWei, tokenRawToWei } from "@/lib/solana/amount-scale";
import { parseUnitsDecimal } from "@/lib/viem-decimal";

const REAL_TOKEN_CAP_HUMAN = 793_100_000;
const TOTAL_SUPPLY_HUMAN = 1_000_000_000;

export function isTokenGraduatedLive(
  status: string,
  progressBps: number,
  curveComplete?: boolean
): boolean {
  return (
    curveComplete === true ||
    status === "GRADUATED" ||
    (Number.isFinite(progressBps) && progressBps >= 10000)
  );
}

export function solanaBondingStateFromLive(params: {
  reserveBnb: string;
  tokenSold: string;
  progressBps: number;
  status: string;
  vaultTokenReserve?: string | null;
  curveComplete?: boolean;
}): BondingCurveState {
  const soldHuman = Number(params.tokenSold ?? 0);
  const graduated = isTokenGraduatedLive(
    params.status,
    params.progressBps,
    params.curveComplete
  );

  const vaultHumanRaw =
    params.vaultTokenReserve != null && params.vaultTokenReserve !== ""
      ? Number(params.vaultTokenReserve)
      : Number.isFinite(soldHuman)
        ? Math.max(0, TOTAL_SUPPLY_HUMAN - soldHuman)
        : TOTAL_SUPPLY_HUMAN;

  const remainingHuman = graduated
    ? 0
    : Math.max(0, REAL_TOKEN_CAP_HUMAN - (Number.isFinite(soldHuman) ? soldHuman : 0));

  const reserveHuman = Number(params.reserveBnb ?? 0);

  return {
    reserveZug: 0n,
    soldTokens: 0n,
    virtualZugReserve: lamportsToWei(PUMP_FEEL_DEFAULTS.virtualSolLamports),
    virtualTokenReserve: tokenRawToWei(PUMP_FEEL_DEFAULTS.virtualTokenReserves),
    realTokenReserves: parseUnitsDecimal(remainingHuman, 18),
    realSolReserves: parseUnitsDecimal(
      Number.isFinite(reserveHuman) && reserveHuman >= 0 ? reserveHuman : 0,
      18
    ),
    complete: graduated,
    vaultTokenReserves: parseUnitsDecimal(
      Number.isFinite(vaultHumanRaw) && vaultHumanRaw >= 0
        ? vaultHumanRaw
        : TOTAL_SUPPLY_HUMAN,
      18
    ),
  };
}
