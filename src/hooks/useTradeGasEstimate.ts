import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { contracts, pumpChain } from "@/config/chain";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
import { bondingCurveManagerAbi, minOutWithSlippage } from "@/lib/bonding-curve";

const ESTIMATE_DEBOUNCE_MS = 120;
export const BUY_GAS_FALLBACK = 130_000n;
const SELL_GAS_FALLBACK = 150_000n;
const APPROVE_GAS_FALLBACK = 55_000n;

type Side = "buy" | "sell";
type BuyInputMode = "usd" | "bnb" | "token";

type UseTradeGasEstimateParams = {
  enabled: boolean;
  address?: `0x${string}`;
  side: Side;
  buyInputMode: BuyInputMode;
  tokenAddress: `0x${string}`;
  targetTokenWei: bigint;
  buySpendWei: bigint;
  resolvedBuyBnbWei: bigint | null;
  buyQuoteOut?: bigint;
  sellQuoteOut?: bigint;
  needsApproval: boolean;
};

async function estimateGasOrFallback(
  estimate: () => Promise<bigint>,
  fallback: bigint
): Promise<bigint> {
  try {
    return await estimate();
  } catch {
    return fallback;
  }
}

export function useTradeGasEstimate(params: UseTradeGasEstimateParams) {
  const publicClient = usePublicClient({ chainId: pumpChain.id });
  const [gasCostWei, setGasCostWei] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!params.enabled || !publicClient) {
      setGasCostWei(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsLoading(true);

      try {
        const gasPricePromise = publicClient.getGasPrice();

        if (!params.address) {
          const gasPrice = await gasPricePromise;
          const totalGas =
            params.side === "buy"
              ? BUY_GAS_FALLBACK
              : APPROVE_GAS_FALLBACK + SELL_GAS_FALLBACK;

          if (!cancelled) {
            setGasCostWei(totalGas * gasPrice);
          }
          return;
        }

        let totalGas = 0n;

        if (params.side === "buy") {
          const buyValue =
            params.buyInputMode === "token"
              ? params.resolvedBuyBnbWei ?? params.buySpendWei
              : params.buySpendWei;

          if (buyValue === 0n) {
            throw new Error("missing buy amount");
          }

          const minTokenOut =
            params.buyInputMode === "token"
              ? minOutWithSlippage(params.targetTokenWei)
              : minOutWithSlippage(params.buyQuoteOut ?? 1n);

          totalGas = await estimateGasOrFallback(
            () =>
              publicClient.estimateContractGas({
                account: params.address,
                address: contracts.bondingCurveManager,
                abi: bondingCurveManagerAbi,
                functionName: "buy",
                args: [params.tokenAddress, minTokenOut],
                value: buyValue,
              }),
            BUY_GAS_FALLBACK
          );
        } else {
          if (params.targetTokenWei === 0n) {
            throw new Error("missing sell amount");
          }

          const minBnbOut = minOutWithSlippage(params.sellQuoteOut ?? 1n);

          if (params.needsApproval) {
            const approveGas = await estimateGasOrFallback(
              () =>
                publicClient.estimateContractGas({
                  account: params.address,
                  address: params.tokenAddress,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [contracts.bondingCurveManager, maxUint256],
                }),
              APPROVE_GAS_FALLBACK
            );
            totalGas += approveGas;
          }

          const sellGas = await estimateGasOrFallback(
            () =>
              publicClient.estimateContractGas({
                account: params.address,
                address: contracts.bondingCurveManager,
                abi: bondingCurveManagerAbi,
                functionName: "sell",
                args: [params.tokenAddress, params.targetTokenWei, minBnbOut],
              }),
            SELL_GAS_FALLBACK
          );
          totalGas += sellGas;
        }

        const gasPrice = await gasPricePromise;

        if (!cancelled) {
          setGasCostWei(totalGas * gasPrice);
        }
      } catch {
        if (!cancelled) {
          setGasCostWei(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, ESTIMATE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    publicClient,
    params.enabled,
    params.address,
    params.side,
    params.buyInputMode,
    params.tokenAddress,
    params.targetTokenWei,
    params.buySpendWei,
    params.resolvedBuyBnbWei,
    params.buyQuoteOut,
    params.sellQuoteOut,
    params.needsApproval,
  ]);

  return { gasCostWei, isLoading };
}
