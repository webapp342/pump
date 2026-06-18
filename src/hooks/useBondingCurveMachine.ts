"use client";

import { useEffect, useRef, useState } from "react";
import type { BondingCurveSnapshot } from "@/lib/bonding-curve";
import {
  applyWsBondingToMachine,
  machineFromCurveTuple,
  machineFromTokenReserves,
  reconcileMachineWithChain,
  type BondingCurveMachine,
} from "@/lib/bonding-curve-state";
import type { ArenaTradeWsPayload } from "@/lib/arena-live-delta";
import type { CurveTuple } from "@/lib/launchpad-events";

type UseBondingCurveMachineOptions = {
  reserveBnb: string;
  tokenSold?: string;
  paused?: boolean;
  chainCurve?: CurveTuple;
  wsBonding?: ArenaTradeWsPayload["bonding"] | null;
};

/**
 * Maintains a local bonding curve snapshot for 0ms trade quotes.
 * WS deltas apply immediately; chain `curves()` reconciles on drift.
 */
export function useBondingCurveMachine({
  reserveBnb,
  tokenSold = "0",
  paused = false,
  chainCurve,
  wsBonding,
}: UseBondingCurveMachineOptions): BondingCurveSnapshot | undefined {
  const [machine, setMachine] = useState<BondingCurveMachine | null>(null);
  const wsVersionRef = useRef(0);

  useEffect(() => {
    setMachine(machineFromTokenReserves(reserveBnb, tokenSold, paused));
    wsVersionRef.current = 0;
  }, [reserveBnb, tokenSold, paused]);

  useEffect(() => {
    if (!chainCurve) return;
    setMachine((prev) => {
      const base =
        prev ?? machineFromTokenReserves(reserveBnb, tokenSold, paused);
      return reconcileMachineWithChain(base, machineFromCurveTuple(chainCurve).snapshot);
    });
  }, [chainCurve, reserveBnb, tokenSold, paused]);

  useEffect(() => {
    if (!wsBonding) return;
    wsVersionRef.current += 1;
    setMachine((prev) => {
      const base =
        prev ?? machineFromTokenReserves(reserveBnb, tokenSold, paused);
      return applyWsBondingToMachine(base, wsBonding);
    });
  }, [wsBonding, reserveBnb, tokenSold, paused]);

  return machine?.snapshot;
}
