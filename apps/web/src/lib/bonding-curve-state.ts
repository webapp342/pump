/**
 * Client bonding curve state machine — instant quote preview without RPC round-trip.
 * Reconciles with on-chain `curves()` on drift; WS bonding deltas apply immediately.
 */

import { formatEther, parseEther, parseUnits } from "viem";
import {
  bondingCurveFromSnapshot,
  bondingCurveSnapshotFromTuple,
  BONDING_TOKEN_SUPPLY_HUMAN,
  BONDING_VIRTUAL_BNB_HUMAN,
  DEFAULT_VIRTUAL_TOKEN_RESERVE,
  DEFAULT_VIRTUAL_ZUG_RESERVE,
  spotPriceBnbFromBondingDecimals,
  type BondingCurveSnapshot,
  type BondingCurveState,
} from "@/lib/bonding-curve";
import type { ArenaTradeWsPayload } from "@/lib/arena-live-delta";
import type { CurveTuple } from "@/lib/launchpad-events";

export type BondingCurveMachine = {
  snapshot: BondingCurveSnapshot;
  state: BondingCurveState;
  version: number;
};

function buildMachine(snapshot: BondingCurveSnapshot, version: number): BondingCurveMachine {
  return {
    snapshot,
    state: bondingCurveFromSnapshot(snapshot),
    version,
  };
}

/** DB / WS bonding fields are human decimals; on-chain snapshots are wei strings. */
function normalizeReserveWei(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  const trimmed = value.trim();
  if (trimmed.includes(".")) {
    try {
      return parseEther(trimmed).toString();
    } catch {
      return fallback;
    }
  }
  try {
    const asBig = BigInt(trimmed);
    if (asBig >= 10n ** 15n) return trimmed;
    return parseEther(trimmed).toString();
  } catch {
    return fallback;
  }
}

function normalizeSoldWei(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  const trimmed = value.trim();
  if (trimmed.includes(".")) {
    try {
      return parseUnits(trimmed, 18).toString();
    } catch {
      return fallback;
    }
  }
  try {
    const asBig = BigInt(trimmed);
    if (asBig >= 10n ** 21n) return trimmed;
    return parseUnits(trimmed, 18).toString();
  } catch {
    return fallback;
  }
}

export function machineFromSnapshot(
  snapshot: BondingCurveSnapshot,
  version = 0
): BondingCurveMachine {
  return buildMachine(snapshot, version);
}

export function machineFromCurveTuple(tuple: CurveTuple, version = 0): BondingCurveMachine {
  return buildMachine(bondingCurveSnapshotFromTuple(tuple), version);
}

/** Bootstrap from indexer DB decimals before chain `curves()` resolves. */
export function machineFromTokenReserves(
  reserveBnb: string,
  tokenSold: string,
  paused = false,
  version = 0,
  virtualZugReserveWei: string = DEFAULT_VIRTUAL_ZUG_RESERVE.toString(),
  virtualTokenReserveWei: string = DEFAULT_VIRTUAL_TOKEN_RESERVE.toString()
): BondingCurveMachine {
  const reserveWei = normalizeReserveWei(reserveBnb, "0");
  const soldWei = normalizeSoldWei(tokenSold, "0");

  return buildMachine(
    {
      reserveZug: reserveWei,
      soldTokens: soldWei,
      virtualZugReserve: virtualZugReserveWei,
      virtualTokenReserve: virtualTokenReserveWei,
      paused,
    },
    version
  );
}

export function machineSpotPriceBnb(machine: BondingCurveMachine): number {
  const { reserveZug, soldTokens, virtualZugReserve, virtualTokenReserve } = machine.snapshot;
  const vzWei = BigInt(virtualZugReserve || "0");
  const vtWei = BigInt(virtualTokenReserve || "0");
  const virtualZug =
    vzWei > 0n ? Number(formatEther(vzWei)) : BONDING_VIRTUAL_BNB_HUMAN;
  const virtualToken =
    vtWei > 0n ? Number(formatEther(vtWei)) : BONDING_TOKEN_SUPPLY_HUMAN;
  const spot = spotPriceBnbFromBondingDecimals(
    formatEther(BigInt(reserveZug || "0")),
    formatEther(BigInt(soldTokens || "0")),
    virtualZug,
    virtualToken
  );
  return spot > 0 ? spot : 0;
}

/** Apply indexer WS bonding fields — same source as token header / arena board. */
export function applyWsBondingToMachine(
  machine: BondingCurveMachine,
  bonding: NonNullable<ArenaTradeWsPayload["bonding"]>
): BondingCurveMachine {
  const prev = machine.snapshot;
  const next: BondingCurveSnapshot = {
    ...prev,
    reserveZug: bonding.reserveZug
      ? normalizeReserveWei(bonding.reserveZug, prev.reserveZug)
      : prev.reserveZug,
    soldTokens: bonding.tokenSold
      ? normalizeSoldWei(bonding.tokenSold, prev.soldTokens)
      : prev.soldTokens,
    paused: prev.paused,
  };
  return buildMachine(next, machine.version + 1);
}

const DRIFT_WEI_FLOOR = 10n ** 14n;

/** Curve tuple with no virtual reserves — token not registered on this manager. */
export function isUninitializedCurveTuple(
  tuple: readonly [unknown, unknown, bigint, bigint, bigint, bigint, bigint, boolean]
): boolean {
  return tuple[5] === 0n && tuple[6] === 0n;
}

/** Snapshot missing virtual reserves — quotes would always return zero. */
export function isEmptyCurveSnapshot(snapshot: BondingCurveSnapshot): boolean {
  const virtualZug = BigInt(snapshot.virtualZugReserve || "0");
  const virtualToken = BigInt(snapshot.virtualTokenReserve || "0");
  return virtualZug === 0n && virtualToken === 0n;
}

/** Prefer chain snapshot when local WS state drifts beyond tolerance. */
export function reconcileMachineWithChain(
  machine: BondingCurveMachine,
  chain: BondingCurveSnapshot
): BondingCurveMachine {
  if (isEmptyCurveSnapshot(chain)) {
    return machine;
  }

  if (machine.version === 0) {
    return buildMachine(chain, 0);
  }

  const localReserve = BigInt(machine.snapshot.reserveZug);
  const chainReserve = BigInt(chain.reserveZug);
  const reserveDrift =
    localReserve >= chainReserve ? localReserve - chainReserve : chainReserve - localReserve;

  const threshold =
    chainReserve > DRIFT_WEI_FLOOR ? chainReserve / 50n : DRIFT_WEI_FLOOR;

  if (reserveDrift > threshold) {
    return buildMachine(chain, machine.version);
  }

  return machine;
}

export function pickLiveCurveSnapshot(
  wsMachine: BondingCurveMachine | null,
  chainSnapshot: BondingCurveSnapshot | undefined,
  tokenReserveBnb: string,
  tokenSold: string,
  paused: boolean
): BondingCurveSnapshot | undefined {
  if (wsMachine) return wsMachine.snapshot;
  if (chainSnapshot && !isEmptyCurveSnapshot(chainSnapshot)) return chainSnapshot;
  if (tokenReserveBnb || tokenSold) {
    return machineFromTokenReserves(tokenReserveBnb, tokenSold, paused).snapshot;
  }
  return undefined;
}
