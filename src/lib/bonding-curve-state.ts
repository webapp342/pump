/**
 * Client bonding curve state machine — instant quote preview without RPC round-trip.
 * Reconciles with on-chain `curves()` on drift; WS bonding deltas apply immediately.
 */

import { formatEther, parseEther, parseUnits } from "viem";
import {
  bondingCurveFromSnapshot,
  bondingCurveSnapshotFromTuple,
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
  version = 0
): BondingCurveMachine {
  let reserveWei = "0";
  let soldWei = "0";
  try {
    reserveWei = parseEther(reserveBnb || "0").toString();
    soldWei = parseUnits(tokenSold || "0", 18).toString();
  } catch {
    // Keep zero reserves on malformed SSR data.
  }

  return buildMachine(
    {
      reserveZug: reserveWei,
      soldTokens: soldWei,
      virtualZugReserve: DEFAULT_VIRTUAL_ZUG_RESERVE.toString(),
      virtualTokenReserve: DEFAULT_VIRTUAL_TOKEN_RESERVE.toString(),
      paused,
    },
    version
  );
}

export function machineSpotPriceBnb(machine: BondingCurveMachine): number {
  const { reserveZug, soldTokens } = machine.snapshot;
  const spot = spotPriceBnbFromBondingDecimals(
    formatEther(BigInt(reserveZug || "0")),
    formatEther(BigInt(soldTokens || "0"))
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
    reserveZug: bonding.reserveZug ?? prev.reserveZug,
    soldTokens: bonding.tokenSold ?? prev.soldTokens,
    paused: prev.paused,
  };
  return buildMachine(next, machine.version + 1);
}

const DRIFT_WEI_FLOOR = 10n ** 14n;

/** Prefer chain snapshot when local WS state drifts beyond tolerance. */
export function reconcileMachineWithChain(
  machine: BondingCurveMachine,
  chain: BondingCurveSnapshot
): BondingCurveMachine {
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
  if (chainSnapshot) return chainSnapshot;
  if (tokenReserveBnb || tokenSold) {
    return machineFromTokenReserves(tokenReserveBnb, tokenSold, paused).snapshot;
  }
  return undefined;
}
