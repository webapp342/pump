"use client";

import { formatEther } from "viem";
import { useEffect, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { contracts, NATIVE_SYMBOL, pumpChain } from "@/config/chain";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { formatPortfolioFeesUsd } from "@/lib/format-usd";

type ClaimCreatorFeesModalProps = {
  open: boolean;
  onClose: () => void;
  claimedBnb: number;
  onClaimed: () => void;
};

function formatFeeBnb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 0.0001) return value.toFixed(6);
  return value.toFixed(8);
}

async function recordClaimInDb(txHash: string, creatorAddress: string): Promise<void> {
  const res = await fetch("/api/portfolio/creator-fees/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txHash, creatorAddress }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Failed to record claim");
  }
}

export function ClaimCreatorFeesModal({
  open,
  onClose,
  claimedBnb,
  onClaimed,
}: ClaimCreatorFeesModalProps) {
  const { bnbUsd } = useBnbUsdPrice();
  const { address, chain } = useAccount();

  const { data: pendingWei, refetch: refetchPending } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "pendingCreatorFees",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: open && Boolean(address), refetchInterval: open ? 5_000 : false },
  });

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const handledTxRef = useRef<string | null>(null);

  const pendingBnb = pendingWei != null ? Number(formatEther(pendingWei)) : 0;
  const totalBnb = claimedBnb + pendingBnb;
  const wrongChain = chain?.id !== pumpChain.id;
  const canClaim = pendingBnb > 0 && !wrongChain && !isPending && !isConfirming;

  useEffect(() => {
    if (!isSuccess || !txHash || !address) return;
    if (handledTxRef.current === txHash) return;
    handledTxRef.current = txHash;

    void (async () => {
      try {
        await recordClaimInDb(txHash, address);
      } catch (err) {
        console.warn("[claim] DB record failed, indexer may catch up:", err);
      }
      await refetchPending();
      onClaimed();
      reset();
      onClose();
    })();
  }, [isSuccess, txHash, address, onClaimed, onClose, refetchPending, reset]);

  if (!open) return null;

  async function handleClaim() {
    if (!canClaim) return;
    writeContract({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "claimCreatorFees",
      chainId: pumpChain.id,
    });
  }

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Creator earnings"
      title="Creator earnings"
      subtitle="Earnings from tokens you launched"
      zIndex={50}
      panelClassName="max-w-md"
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="secondary-button flex-1">
            Close
          </button>
          <button
            type="button"
            disabled={!canClaim}
            onClick={() => void handleClaim()}
            className="primary-button flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending || isConfirming ? "Claiming…" : "Claim"}
          </button>
        </div>
      }
    >
        <table className="sheet-grid w-full">
          <tbody>
            <tr>
              <th scope="row">Total earned</th>
              <td className="financial-value">
                {formatPortfolioFeesUsd(totalBnb, bnbUsd)}{" "}
                <span className="text-caption text-pump-muted">
                  ({formatFeeBnb(totalBnb)} {NATIVE_SYMBOL})
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row">Claimed</th>
              <td className="financial-value">
                {formatPortfolioFeesUsd(claimedBnb, bnbUsd)}{" "}
                <span className="text-caption text-pump-muted">
                  ({formatFeeBnb(claimedBnb)} {NATIVE_SYMBOL})
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row">Pending</th>
              <td className="financial-value">
                {formatPortfolioFeesUsd(pendingBnb, bnbUsd)}{" "}
                <span className="text-caption text-pump-muted">
                  ({formatFeeBnb(pendingBnb)} {NATIVE_SYMBOL})
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {wrongChain ? (
          <p className="notice-warning mt-3">Switch to BSC Testnet to claim.</p>
        ) : null}

        {writeError ? (
          <p className="notice-error mt-3">{writeError.message.split("\n")[0]}</p>
        ) : null}

        {txHash ? (
          <p className="mt-3 break-all text-caption text-pump-muted">
            Tx: {txHash.slice(0, 10)}…{isConfirming ? " confirming…" : isSuccess ? " saving…" : ""}
          </p>
        ) : null}

    </AppBottomSheet>
  );
}
