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
  decodeReferrerBinding,
  pdaCreatorFees,
  pdaCurve,
  pdaGlobal,
  pdaReferrerBinding,
} from "@/lib/solana/launchpad-pdas";
import {
  buildSolanaBuyInstructions,
  buildSolanaSellInstructions,
} from "@/lib/solana/trade-instructions";
import { getLiveTransactionFeeLamports } from "@/lib/solana/tx-fee";
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
  /** False when first buy must create the trader ATA (~0.002 SOL rent). */
  traderAtaExists: boolean | undefined;
  /** False when set_referrer must create the binding PDA. */
  referrerBindingExists: boolean | undefined;
  /** On-chain bound referrer (lifetime fee recipient). */
  boundReferrer: string | null | undefined;
  /** False when buy must CreateAccount the creator-fees PDA (paid by trader). */
  creatorFeesPdaExists: boolean | undefined;
  /** Base tx fee from RPC getFeeForMessage (no priority tip). */
  buyTxFeeLamports: bigint | undefined;
  sellTxFeeLamports: bigint | undefined;
  refetchBalances: () => Promise<void>;
};

async function fetchMarket(mintAddress: string, ownerAddress?: string) {
  const conn = getSolanaConnection();
  const mint = new PublicKey(mintAddress);
  const [globalPda] = pdaGlobal();
  const [curvePda] = pdaCurve(mint);

  const [globalInfo, curveInfo, solLamports, tokenSnapshot, bindingInfo] = await Promise.all([
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
          const [bal, ataInfo] = await Promise.all([
            conn.getTokenAccountBalance(ata, "confirmed").catch(() => null),
            conn.getAccountInfo(ata, "confirmed"),
          ]);
          return {
            tokenRaw: bal?.value?.amount ? BigInt(bal.value.amount) : 0n,
            traderAtaExists: ataInfo !== null,
          };
        })()
      : Promise.resolve(null),
    ownerAddress
      ? conn.getAccountInfo(pdaReferrerBinding(new PublicKey(ownerAddress))[0], "confirmed")
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

  let creatorFeesPdaExists: boolean | undefined;
  if (curve) {
    const [feesPda] = pdaCreatorFees(curve.creator);
    const feesInfo = await conn.getAccountInfo(feesPda, "confirmed");
    creatorFeesPdaExists = feesInfo != null && feesInfo.lamports > 0;
  }

  let referrerBindingExists: boolean | undefined;
  let boundReferrer: string | null | undefined;
  if (ownerAddress) {
    referrerBindingExists =
      bindingInfo != null && (bindingInfo.data?.length ?? 0) >= 65;
    if (bindingInfo?.data && bindingInfo.data.length >= 65) {
      try {
        const binding = decodeReferrerBinding(bindingInfo.data);
        boundReferrer = binding.referrer.equals(PublicKey.default)
          ? null
          : binding.referrer.toBase58();
      } catch {
        boundReferrer = null;
      }
    } else {
      boundReferrer = null;
    }
  }

  const bondingCurve: BondingCurveState | undefined = curve
    ? {
        // pump.fun: quotes use virtual reserves only (real is folded into virtual on each trade).
        // Keep reserveZug/soldTokens at 0 so EVM-style quoteBuy (x0=v+r, y0=v-s) == pump.fun.
        reserveZug: 0n,
        soldTokens: 0n,
        virtualZugReserve: lamportsToWei(curve.virtualSolReserves),
        virtualTokenReserve: tokenRawToWei(curve.virtualTokenReserves),
        realTokenReserves: tokenRawToWei(curve.realTokenReserves),
        realSolReserves: lamportsToWei(curve.realSolReserves),
      }
    : undefined;

  const paused = Boolean(
    (curve?.paused ?? 0) !== 0 ||
      (curve?.complete ?? 0) !== 0 ||
      (global?.emergencyHalt ?? 0) !== 0
  );

  let buyTxFeeLamports: bigint | undefined;
  let sellTxFeeLamports: bigint | undefined;
  if (ownerAddress && curve) {
    const trader = new PublicKey(ownerAddress);
    const includeAtaCreate = tokenSnapshot?.traderAtaExists !== true;
    try {
      const buyIxs = buildSolanaBuyInstructions({
        trader,
        mint,
        curvePda,
        curve,
        solInLamports: 1_000_000n,
        minTokenOut: 1n,
        includeAtaCreate,
      });
      const sellIxs = buildSolanaSellInstructions({
        trader,
        mint,
        curvePda,
        curve,
        tokenIn: 1_000_000n,
        minSolOut: 1n,
      });
      [buyTxFeeLamports, sellTxFeeLamports] = await Promise.all([
        getLiveTransactionFeeLamports(conn, buyIxs, trader),
        getLiveTransactionFeeLamports(conn, sellIxs, trader),
      ]);
    } catch {
      buyTxFeeLamports = undefined;
      sellTxFeeLamports = undefined;
    }
  }

  return {
    bondingCurve,
    protocolFeeBps:
      global?.protocolFeeBps ?? BigInt(PUMP_FEEL_DEFAULTS.protocolFeeBps),
    paused,
    solBalanceWei:
      solLamports != null ? lamportsToWei(BigInt(solLamports)) : undefined,
    tokenBalanceWei:
      tokenSnapshot != null ? tokenRawToWei(tokenSnapshot.tokenRaw) : undefined,
    traderAtaExists: tokenSnapshot?.traderAtaExists,
    referrerBindingExists,
    boundReferrer,
    creatorFeesPdaExists,
    buyTxFeeLamports,
    sellTxFeeLamports,
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
    traderAtaExists: query.data?.traderAtaExists,
    referrerBindingExists: query.data?.referrerBindingExists,
    boundReferrer: query.data?.boundReferrer,
    creatorFeesPdaExists: query.data?.creatorFeesPdaExists,
    buyTxFeeLamports: query.data?.buyTxFeeLamports,
    sellTxFeeLamports: query.data?.sellTxFeeLamports,
    refetchBalances,
  };
}
