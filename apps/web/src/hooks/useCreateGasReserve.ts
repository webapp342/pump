"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { contracts, pumpChain } from "@/config/chain";
import { bufferedGasCostWei } from "@/lib/aa/gas-buffer";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";

const ESTIMATE_DEBOUNCE_MS = 150;

const MEME_CREATE_GAS_FALLBACK = 1_200_000n;
const AIRDROP_CREATE_GAS_FALLBACK = 900_000n;
const APPROVE_GAS_FALLBACK = 55_000n;

async function estimateGasOrFallback(
  estimate: () => Promise<bigint>,
  fallback: bigint
): Promise<bigint> {
  try {
    const gas = await estimate();
    return gas > 0n ? gas : fallback;
  } catch {
    return fallback;
  }
}

export type UseCreateGasReserveParams =
  | {
      kind: "meme";
      enabled: boolean;
      address?: Address;
      name: string;
      symbol: string;
      minTokenOut: bigint;
      valueWei: bigint;
    }
  | {
      kind: "airdrop";
      enabled: boolean;
      address?: Address;
      needsApprove: boolean;
      rewardToken?: Address;
    };

export function useCreateGasReserve(params: UseCreateGasReserveParams) {
  const publicClient = usePublicClient({ chainId: pumpChain.id });
  const [gasReserveWei, setGasReserveWei] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const enabled = params.enabled;
  const kind = params.kind;
  const address = params.address;
  const memeName = params.kind === "meme" ? params.name : "";
  const memeSymbol = params.kind === "meme" ? params.symbol : "";
  const memeMinTokenOut = params.kind === "meme" ? params.minTokenOut : 0n;
  const memeValueWei = params.kind === "meme" ? params.valueWei : 0n;
  const needsApprove = params.kind === "airdrop" ? params.needsApprove : false;
  const rewardToken = params.kind === "airdrop" ? params.rewardToken : undefined;

  useEffect(() => {
    if (!enabled || !publicClient) {
      setGasReserveWei(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        try {
          const gasPrice = await publicClient.getGasPrice();
          let gasUnits = 0n;

          if (kind === "meme") {
            const name = memeName.trim() || "Token";
            const symbol = memeSymbol.trim().toUpperCase() || "TKN";
            const minOut = memeMinTokenOut > 0n ? memeMinTokenOut : 1n;

            if (address) {
              gasUnits = await estimateGasOrFallback(
                () =>
                  publicClient.estimateContractGas({
                    account: address,
                    address: contracts.memeFactory,
                    abi: memeFactoryAbi,
                    functionName: "createMeme",
                    args: [name, symbol, "", minOut],
                    value: memeValueWei,
                  }),
                MEME_CREATE_GAS_FALLBACK
              );
            } else {
              gasUnits = MEME_CREATE_GAS_FALLBACK;
            }
          } else {
            if (needsApprove && address && rewardToken) {
              const approveGas = await estimateGasOrFallback(
                () =>
                  publicClient.estimateContractGas({
                    account: address,
                    address: rewardToken,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [contracts.airdropManager!, maxUint256],
                  }),
                APPROVE_GAS_FALLBACK
              );
              gasUnits += approveGas;
            }

            const createGas = address
              ? await estimateGasOrFallback(
                  () =>
                    publicClient.estimateContractGas({
                      account: address,
                      address: contracts.airdropManager!,
                      abi: pumpAirdropManagerAbi,
                      functionName: "createAirdrop",
                      args: [
                        "0x0000000000000000000000000000000000000001",
                        rewardToken ?? "0x0000000000000000000000000000000000000000",
                        1n,
                        `0x${"00".repeat(32)}`,
                        BigInt(Math.floor(Date.now() / 1000) + 3600),
                        BigInt(Math.floor(Date.now() / 1000) + 7200),
                      ],
                      value: 0n,
                    }),
                  AIRDROP_CREATE_GAS_FALLBACK
                )
              : AIRDROP_CREATE_GAS_FALLBACK;
            gasUnits += createGas;
          }

          const reserve = bufferedGasCostWei(gasUnits, gasPrice);
          if (!cancelled) setGasReserveWei(reserve);
        } catch {
          if (!cancelled) setGasReserveWei(null);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();
    }, ESTIMATE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    publicClient,
    enabled,
    kind,
    address,
    memeName,
    memeSymbol,
    memeMinTokenOut,
    memeValueWei,
    needsApprove,
    rewardToken,
  ]);

  return { gasReserveWei, isLoading };
}
