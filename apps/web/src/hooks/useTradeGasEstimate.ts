import { useEffect, useRef, useState } from "react";
import { encodeFunctionData } from "viem";
import { usePublicClient } from "wagmi";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { contracts, pumpChain } from "@/config/chain";
import { estimateKernelUserOpPrefundWei } from "@/lib/aa/estimate-kernel-user-op-prefund";
import { resolveTradeUserOpGasPrice } from "@/lib/aa/pimlico-gas-price";
import {
  DEFAULT_APPROVE_CALL_GAS,
  DEFAULT_BUY_CALL_GAS,
  DEFAULT_SELL_CALL_GAS,
  userOpPrefundFromCallGasEstimate,
} from "@/lib/aa/user-op-prefund";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
import { bondingCurveManagerAbi, minOutWithSlippage } from "@/lib/bonding-curve";

const ESTIMATE_DEBOUNCE_MS = 120;

export const BUY_GAS_FALLBACK = DEFAULT_BUY_CALL_GAS;
export const SELL_GAS_FALLBACK = DEFAULT_SELL_CALL_GAS;
export const APPROVE_GAS_FALLBACK = DEFAULT_APPROVE_CALL_GAS;

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

async function resolveMaxFeePerGas(
  getGasPrice: () => Promise<bigint>
): Promise<bigint> {
  const fees = await resolveTradeUserOpGasPrice(getGasPrice);
  return fees.maxFeePerGas;
}

export function useTradeGasEstimate(params: UseTradeGasEstimateParams) {
  const publicClient = usePublicClient({ chainId: pumpChain.id });
  const { kernelClient } = usePumpWallet();
  const [gasCostWei, setGasCostWei] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const gasCostWeiRef = useRef<bigint | null>(null);
  gasCostWeiRef.current = gasCostWei;

  useEffect(() => {
    if (!params.enabled || !publicClient) {
      setGasCostWei(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (gasCostWeiRef.current == null) {
        setIsLoading(true);
      }

      try {
        const gasPricePromise = publicClient.getGasPrice();
        const maxFeePromise = resolveMaxFeePerGas(() => gasPricePromise);

        if (!params.address) {
          const maxFeePerGas = await maxFeePromise;
          const callGas =
            params.side === "buy"
              ? DEFAULT_BUY_CALL_GAS
              : DEFAULT_APPROVE_CALL_GAS + DEFAULT_SELL_CALL_GAS;

          if (!cancelled) {
            setGasCostWei(userOpPrefundFromCallGasEstimate(callGas, maxFeePerGas));
          }
          return;
        }

        if (params.side === "buy") {
          const buyValue = params.buySpendWei;
          if (buyValue === 0n) {
            throw new Error("missing buy amount");
          }

          const minTokenOut = minOutWithSlippage(params.buyQuoteOut ?? 1n);

          const buyData = encodeFunctionData({
            abi: bondingCurveManagerAbi,
            functionName: "buy",
            args: [params.tokenAddress, minTokenOut],
          });

          if (kernelClient?.account) {
            const prefund = await estimateKernelUserOpPrefundWei(kernelClient, {
              to: contracts.bondingCurveManager,
              data: buyData,
              value: buyValue,
            });
            if (!cancelled) setGasCostWei(prefund);
            return;
          }

          const callGas = await estimateGasOrFallback(
            () =>
              publicClient.estimateContractGas({
                account: params.address,
                address: contracts.bondingCurveManager,
                abi: bondingCurveManagerAbi,
                functionName: "buy",
                args: [params.tokenAddress, minTokenOut],
                value: buyValue,
              }),
            DEFAULT_BUY_CALL_GAS
          );
          const maxFeePerGas = await maxFeePromise;
          if (!cancelled) {
            setGasCostWei(userOpPrefundFromCallGasEstimate(callGas, maxFeePerGas));
          }
          return;
        }

        if (params.targetTokenWei === 0n) {
          throw new Error("missing sell amount");
        }

        const minBnbOut = minOutWithSlippage(params.sellQuoteOut ?? 1n);
        let totalPrefund = 0n;

        if (params.needsApproval) {
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [contracts.bondingCurveManager, maxUint256],
          });

          if (kernelClient?.account) {
            totalPrefund += await estimateKernelUserOpPrefundWei(kernelClient, {
              to: params.tokenAddress,
              data: approveData,
            });
          } else {
            const approveGas = await estimateGasOrFallback(
              () =>
                publicClient.estimateContractGas({
                  account: params.address,
                  address: params.tokenAddress,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [contracts.bondingCurveManager, maxUint256],
                }),
              DEFAULT_APPROVE_CALL_GAS
            );
            const maxFeePerGas = await maxFeePromise;
            totalPrefund += userOpPrefundFromCallGasEstimate(approveGas, maxFeePerGas);
          }
        }

        const sellData = encodeFunctionData({
          abi: bondingCurveManagerAbi,
          functionName: "sell",
          args: [params.tokenAddress, params.targetTokenWei, minBnbOut],
        });

        if (kernelClient?.account) {
          totalPrefund += await estimateKernelUserOpPrefundWei(kernelClient, {
            to: contracts.bondingCurveManager,
            data: sellData,
          });
        } else {
          const sellGas = await estimateGasOrFallback(
            () =>
              publicClient.estimateContractGas({
                account: params.address,
                address: contracts.bondingCurveManager,
                abi: bondingCurveManagerAbi,
                functionName: "sell",
                args: [params.tokenAddress, params.targetTokenWei, minBnbOut],
              }),
            DEFAULT_SELL_CALL_GAS
          );
          const maxFeePerGas = await maxFeePromise;
          totalPrefund += userOpPrefundFromCallGasEstimate(sellGas, maxFeePerGas);
        }

        if (!cancelled) {
          setGasCostWei(totalPrefund);
        }
      } catch {
        if (!cancelled && gasCostWeiRef.current == null) {
          try {
            const gasPrice = await publicClient.getGasPrice();
            const maxFeePerGas = await resolveMaxFeePerGas(() => Promise.resolve(gasPrice));
            const callGas =
              params.side === "buy"
                ? DEFAULT_BUY_CALL_GAS
                : DEFAULT_APPROVE_CALL_GAS + DEFAULT_SELL_CALL_GAS;
            setGasCostWei(userOpPrefundFromCallGasEstimate(callGas, maxFeePerGas));
          } catch {
            /* keep prior stale value if any */
          }
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
    kernelClient,
    params.enabled,
    params.address,
    params.side,
    params.tokenAddress,
    params.targetTokenWei,
    params.buySpendWei,
    params.buyQuoteOut,
    params.sellQuoteOut,
    params.needsApproval,
  ]);

  return { gasCostWei, isLoading };
}
