import type { QueryClient } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { getBalanceQueryKey, readContractQueryKey } from "wagmi/query";
import { contracts, pumpChain } from "@/config/chain";
import { invalidateScwBalance } from "@/lib/scw-balance-sync";

/** Flashblocks confirm can beat balance RPC — retry until chain catches up.
 *  Skip delay 0 so optimistic cache writes are not immediately overwritten by a stale read. */
const DEFAULT_REFRESH_DELAYS_MS = [450, 1_200, 3_000] as const;

export function tradeNativeBalanceQueryKey(address: Address) {
  return getBalanceQueryKey({ address, chainId: pumpChain.id });
}

export function tradeTokenBalanceQueryKey(tokenAddress: Address, holder: Address) {
  return readContractQueryKey({
    address: tokenAddress,
    chainId: pumpChain.id,
    functionName: "balanceOf",
    args: [holder],
  });
}

export function tradeAllowanceQueryKey(tokenAddress: Address, holder: Address) {
  return readContractQueryKey({
    address: tokenAddress,
    chainId: pumpChain.id,
    functionName: "allowance",
    args: [holder, contracts.bondingCurveManager],
  });
}

type NativeBalanceCache = {
  value: bigint;
  decimals: number;
  formatted: string;
  symbol: string;
};

/**
 * Instant Available/Max update from fill deltas so UI does not wait on RPC.
 * Signed deltas: buy typically native− / token+; sell native+ / token−.
 */
export function applyOptimisticTradeWalletBalances(
  queryClient: QueryClient,
  params: {
    address: Address;
    tokenAddress: Address;
    nativeDeltaWei: bigint;
    tokenDeltaWei: bigint;
  }
): void {
  const { address, tokenAddress, nativeDeltaWei, tokenDeltaWei } = params;

  queryClient.setQueryData(
    tradeNativeBalanceQueryKey(address),
    (prev: NativeBalanceCache | null | undefined) => {
      if (!prev || typeof prev.value !== "bigint") return prev;
      const next = prev.value + nativeDeltaWei;
      const value = next < 0n ? 0n : next;
      const decimals = prev.decimals ?? 18;
      return {
        ...prev,
        value,
        formatted: formatUnits(value, decimals),
      };
    }
  );

  queryClient.setQueryData(
    tradeTokenBalanceQueryKey(tokenAddress, address),
    (prev: bigint | null | undefined) => {
      if (typeof prev !== "bigint") return prev;
      const next = prev + tokenDeltaWei;
      return next < 0n ? 0n : next;
    }
  );
}

export async function refreshTradeWalletBalances(
  queryClient: QueryClient,
  params: { address: Address; tokenAddress: Address }
): Promise<void> {
  const { address, tokenAddress } = params;
  invalidateScwBalance();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tradeNativeBalanceQueryKey(address) }),
    queryClient.invalidateQueries({
      queryKey: tradeTokenBalanceQueryKey(tokenAddress, address),
    }),
    queryClient.invalidateQueries({
      queryKey: tradeAllowanceQueryKey(tokenAddress, address),
    }),
  ]);
}

/** Fire-and-forget invalidate + retries (safe after TradePanel unmount). */
export function scheduleTradeWalletBalanceRefresh(
  queryClient: QueryClient,
  params: { address: Address; tokenAddress: Address },
  delaysMs: readonly number[] = DEFAULT_REFRESH_DELAYS_MS
): void {
  for (const delay of delaysMs) {
    window.setTimeout(() => {
      void refreshTradeWalletBalances(queryClient, params);
    }, delay);
  }
}
