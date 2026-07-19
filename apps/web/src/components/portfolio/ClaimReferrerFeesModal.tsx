"use client";

import { formatEther } from "viem";
import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { contracts, NATIVE_SYMBOL, pumpChain, shortAddress } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { buildReferralInviteUrl, truncateReferralInviteUrl } from "@/lib/referral-link";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { PumpIcon, faInviteLink } from "@/lib/icons";
import { referralSharePayload } from "@/lib/share-links";
import { formatPortfolioFeesUsd } from "@/lib/format-usd";

type ClaimReferrerFeesModalProps = {
  open: boolean;
  onClose: () => void;
  claimedBnb: number;
  inviteCount: number;
  referralVolumeBnb: number;
  onClaimed: () => void;
};

function formatFeeBnb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 0.0001) return value.toFixed(6);
  return value.toFixed(8);
}

function formatVolumeBnb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.0001) return value.toFixed(6);
  return value.toFixed(8);
}

async function recordClaimInDb(txHash: string, referrerAddress: string): Promise<void> {
  const res = await fetch("/api/referrals/claims/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txHash, referrerAddress }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Failed to record claim");
  }
}

export function ClaimReferrerFeesModal({
  open,
  onClose,
  claimedBnb,
  inviteCount,
  referralVolumeBnb,
  onClaimed,
}: ClaimReferrerFeesModalProps) {
  const { bnbUsd } = useBnbUsdPrice();
  const { address, chain } = useAccount();
  const { displayUsername } = useUserAvatar();
  const [shareOpen, setShareOpen] = useState(false);

  const { data: pendingWei, refetch: refetchPending } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "pendingReferrerFees",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: open && Boolean(address), refetchInterval: open ? 5_000 : false },
  });

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const handledTxRef = useRef<string | null>(null);

  const inviteUrl = address ? buildReferralInviteUrl(address) : "";
  const sharePayload = address ? referralSharePayload(address) : null;

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
        console.warn("[referrer-claim] DB record failed, indexer may catch up:", err);
      }
      await refetchPending();
      onClaimed();
      reset();
      onClose();
    })();
  }, [isSuccess, txHash, address, onClaimed, onClose, refetchPending, reset]);

  if (!open) return null;

  if (isSolanaChainFamily) {
    return (
      <AppBottomSheet
        open={open}
        onClose={onClose}
        ariaLabel="Referral earnings"
        title="Referral earnings"
        subtitle="Earnings from friends you invited"
        zIndex={50}
        panelClassName="max-w-md"
        footer={
          <button type="button" onClick={onClose} className="secondary-button w-full">
            Close
          </button>
        }
      >
        <p className="text-body-sm text-pump-muted">
          On Solana, referrer fees are paid automatically when invited friends trade. No manual
          claim is required.
        </p>
      </AppBottomSheet>
    );
  }

  async function handleClaim() {
    if (!canClaim) return;
    writeContract({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "claimReferrerFees",
      chainId: pumpChain.id,
    });
  }

  return (
    <>
      <AppBottomSheet
        open={open}
        onClose={onClose}
        ariaLabel="Referral earnings"
        title="Referral earnings"
        subtitle="Earnings from friends you invited"
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
            <tr>
              <th scope="row">Invites</th>
              <td className="financial-value">{inviteCount}</td>
            </tr>
            <tr>
              <th scope="row">Ref. volume</th>
              <td className="financial-value">
                {formatPortfolioFeesUsd(referralVolumeBnb, bnbUsd)}{" "}
                <span className="text-caption text-pump-muted">
                  ({formatVolumeBnb(referralVolumeBnb)} {NATIVE_SYMBOL})
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {inviteUrl ? (
          <div className="mt-3 border border-pump-border/45 bg-pump-border/4 p-2.5">
            <p className="section-label">Invite link</p>
            <p
              className="mt-1 truncate font-mono text-caption text-pump-text"
              title={inviteUrl}
            >
              {truncateReferralInviteUrl(inviteUrl)}
            </p>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="secondary-button mt-2 inline-flex items-center justify-center gap-1.5"
            >
              <PumpIcon icon={faInviteLink} className="h-3.5 w-3.5 shrink-0 opacity-80" />
              Share
            </button>
          </div>
        ) : null}

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

      {sharePayload ? (
        <ShareSheetModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          payload={sharePayload}
          title="Share invite"
          description="Friends must open your link before their first trade."
        />
      ) : null}
    </>
  );
}
