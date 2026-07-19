"use client";

/**
 * Solana launchpad market + balances for TradePanel (CHAIN_FAMILY=solana).
 * Curve / balances are scaled into 18-decimal wei so existing quote UI works.
 */

import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addressCacheKey } from "@/lib/address";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PUMP_FEEL_DEFAULTS } from "@/config/solana";
import type { BondingCurveState } from "@/lib/bonding-curve";
import { getSolanaConnection } from "@/lib/solana/transfer";
import {
  decodeCurveAccount,
  decodeGlobalConfig,
  pdaCurve,
  pdaGlobal,
} from "@/lib/solana/launchpad-pdas";
import {
  lamportsToWei,
  tokenRawToWei,
} from "@/lib/solana/amount-scale";

const POLL_MS = 4_000;

export type SolanaTradeMarket = {
  bondingCurve: BondingCurveState | undefined;
  protocolFeeBps: bigint | undefined;
  paused: boolean;
  solBalanceWei: bigint | undefined;
  tokenBalanceWei: bigint | undefined;
  refetchBalances: () => Promise<void>;
};

async function fetchMarket(mintAddress: string, ownerAddress?: string) {
  const conn = getSolanaConnection();
  const mint = new PublicKey(mintAddress);
  const [globalPda] = pdaGlobal();
  const [curvePda] = pdaCurve(mint);

  const [globalInfo, curveInfo, solLamports, tokenRaw] = await Promise.all([
    conn.getAccountInfo(globalPda, "confirmed"),
    conn.getAccountInfo(curvePda, "confirmed"),
    ownerAddress
      ? conn.getBalance(new PublicKey(ownerAddress), "confirmed")
      : Promise.resolve(null),
    ownerAddress
      ? (async () => {
          const ata = getAssociatedTokenAddressSync(
            mint,
            new PublicKey(ownerAddress),
            false,
            TOKEN_PROGRAM_ID
          );
          const bal = await conn.getTokenAccountBalance(ata, "confirmed").catch(() => null);
          return bal?.value?.amount ? BigInt(bal.value.amount) : 0n;
        })()
      : Promise.resolve(null),
  ]);

  let global = null;
  try {
    global = globalInfo?.data ? decodeGlobalConfig(globalInfo.data) : null;
  } catch {
    global = null;
  }

  let curve = null;
  try {
    curve = curveInfo?.data ? decodeCurveAccount(curveInfo.data) : null;
  } catch {
    curve = null;
  }

  const bondingCurve: BondingCurveState | undefined = curve
    ? {
        reserveZug: lamportsToWei(curve.reserveSol),
        soldTokens: tokenRawToWei(curve.soldTokens),
        virtualZugReserve: lamportsToWei(curve.virtualSolReserve),
        virtualTokenReserve: tokenRawToWei(curve.virtualTokenReserve),
      }
    : undefined;

  const paused = Boolean(
    (curve?.paused ?? 0) !== 0 || (global?.emergencyHalt ?? 0) !== 0
  );

  return {
    bondingCurve,
    protocolFeeBps:
      global?.protocolFeeBps ?? BigInt(PUMP_FEEL_DEFAULTS.protocolFeeBps),
    paused,
    solBalanceWei:
      solLamports != null ? lamportsToWei(BigInt(solLamports)) : undefined,
    tokenBalanceWei: tokenRaw != null ? tokenRawToWei(tokenRaw) : undefined,
  };
}

export function useSolanaTradeMarket(
  mintAddress: string | undefined,
  ownerAddress: string | undefined,
  enabled: boolean
): SolanaTradeMarket {
  const mintKey = addressCacheKey(mintAddress) ?? mintAddress;
  const ownerKey = addressCacheKey(ownerAddress) ?? ownerAddress;

  const query = useQuery({
    queryKey: ["solana-trade-market", mintKey, ownerKey ?? ""],
    queryFn: () => fetchMarket(mintKey!, ownerKey),
    enabled: enabled && Boolean(mintKey),
    refetchInterval: POLL_MS,
    staleTime: 1_500,
    placeholderData: keepPreviousData,
  });

  const refetchBalances = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    bondingCurve: query.data?.bondingCurve,
    protocolFeeBps: query.data?.protocolFeeBps,
    paused: query.data?.paused ?? false,
    solBalanceWei: query.data?.solBalanceWei,
    tokenBalanceWei: query.data?.tokenBalanceWei,
    refetchBalances,
  };
}
