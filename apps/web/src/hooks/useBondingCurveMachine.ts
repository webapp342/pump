"use client";

import { useEffect, useRef, useState } from "react";
import type { BondingCurveSnapshot } from "@/lib/bonding-curve";
import {
  applyWsBondingToMachine,
  isUninitializedCurveTuple,
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
 * When chain/WS virtuals are known, reserve-only resets must keep those virtuals
 * (Solana pump-feel ≠ EVM default 5/1B — resetting to defaults spikes false MCAP).
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
  const virtualsRef = useRef<{ zug: string; token: string } | null>(null);

  useEffect(() => {
    if (!chainCurve || isUninitializedCurveTuple(chainCurve)) return;
    if (chainCurve[5] > 0n && chainCurve[6] > 0n) {
      virtualsRef.current = {
        zug: chainCurve[5].toString(),
        token: chainCurve[6].toString(),
      };
    }
  }, [chainCurve]);

  useEffect(() => {
    const v = virtualsRef.current;
    setMachine(
      machineFromTokenReserves(
        reserveBnb,
        tokenSold,
        paused,
        0,
        v?.zug,
        v?.token
      )
    );
    wsVersionRef.current = 0;
  }, [reserveBnb, tokenSold, paused]);

  useEffect(() => {
    if (!chainCurve || isUninitializedCurveTuple(chainCurve)) return;
    setMachine((prev) => {
      const v = virtualsRef.current;
      const base =
        prev ??
        machineFromTokenReserves(
          reserveBnb,
          tokenSold,
          paused,
          0,
          v?.zug,
          v?.token
        );
      return reconcileMachineWithChain(base, machineFromCurveTuple(chainCurve).snapshot);
    });
  }, [chainCurve, reserveBnb, tokenSold, paused]);

  useEffect(() => {
    if (!wsBonding) return;
    wsVersionRef.current += 1;
    setMachine((prev) => {
      const v = virtualsRef.current;
      const base =
        prev ??
        machineFromTokenReserves(
          reserveBnb,
          tokenSold,
          paused,
          0,
          v?.zug,
          v?.token
        );
      return applyWsBondingToMachine(base, wsBonding);
    });
  }, [wsBonding, reserveBnb, tokenSold, paused]);

  return machine?.snapshot;
}
