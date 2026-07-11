"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { MyAirdropParticipation } from "@/lib/db/airdrops";
import { formatAirdropDisplayStatus } from "@/lib/airdrop-status";
import { formatParticipantRankLabel } from "@/lib/airdrop-participant-snapshot";
import { formatAirdropReward, formatProjectedRankReward } from "@/lib/airdrop-board-format";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { contracts, pumpChain } from "@/config/chain";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import { formatUsdReadable } from "@/lib/format-usd";
import {
  claimableRewardUsd,
  estimatedRewardUsd,
  formatEstPayoutUsd,
  isReadyToClaim,
  partitionJoinedAirdrops,
  poolSymbol,
  sumUsd,
  tickerLabel,
} from "@/lib/portfolio-airdrop-summary";

type ClaimTarget = {
  item: MyAirdropParticipation;
  amount: string;
  proof: `0x${string}`[];
  onChainId: string;
};

type ClaimAllAirdropsModalProps = {
  open: boolean;
  onClose: () => void;
  items: MyAirdropParticipation[];
  address: string;
  onClaimed: () => void;
};

async function fetchClaimTarget(
  item: MyAirdropParticipation,
  address: string
): Promise<ClaimTarget | null> {
  if (!isReadyToClaim(item) || !item.onChainId) return null;

  const res = await fetch(`/api/airdrops/${item.id}/proof/${address}`, { cache: "no-store" });
  if (!res.ok) return null;

  const json = (await res.json()) as { data?: { amount: string; proof: string[] } };
  if (!json.data?.proof?.length || !json.data.amount) return null;

  return {
    item,
    amount: json.data.amount,
    proof: json.data.proof as `0x${string}`[],
    onChainId: item.onChainId,
  };
}

function RewardBadge({
  item,
  usd,
}: {
  item: MyAirdropParticipation;
  usd: number | null;
}) {
  const isBnb = !item.rewardToken;
  const usdLabel = formatEstPayoutUsd(usd);

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {isBnb ? (
        <BnbLogo size={14} className="shrink-0" />
      ) : (
        <TokenAvatar
          address={item.rewardToken!}
          symbol={item.rewardSymbol ?? "?"}
          size={14}
          className="shrink-0"
        />
      )}
      <span className="financial-value text-caption font-medium text-pump-text">
        {usdLabel ?? "—"}
      </span>
    </span>
  );
}

function CampaignRow({
  item,
  trailing,
  sub,
}: {
  item: MyAirdropParticipation;
  trailing: ReactNode;
  sub?: string;
}) {
  const symbol = poolSymbol(item);

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <TokenAvatar address={item.linkedToken} symbol={symbol} className="shrink-0 portfolio-holdings-grid__coin-mark !ring-0" />
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium text-pump-text">{tickerLabel(item)}</p>
          {sub ? <p className="mt-0.5 text-caption text-pump-muted">{sub}</p> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">{trailing}</div>
    </li>
  );
}

const MAX_CLAIM_BATCH = 25;

export function ClaimAllAirdropsModal({
  open,
  onClose,
  items,
  address,
  onClaimed,
}: ClaimAllAirdropsModalProps) {
  const { openConnectModal } = useOpenConnectModal();
  const { isConnected, chain } = useAccount();
  const { bnbUsd } = useBnbUsdPrice();
  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [targets, setTargets] = useState<ClaimTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimDone, setClaimDone] = useState(false);
  const handledTxRef = useRef<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<ClaimTarget[][] | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);

  const activeItems = useMemo(
    () => items.filter((item) => item.displayStatus !== "CLOSED"),
    [items]
  );

  const buckets = useMemo(() => partitionJoinedAirdrops(activeItems), [activeItems]);

  const claimableUsdTotal = useMemo(
    () => sumUsd(buckets.claimable.map((item) => claimableRewardUsd(item, bnbUsd))),
    [buckets.claimable, bnbUsd]
  );

  const estimatedQualifyingUsd = useMemo(
    () => sumUsd(buckets.qualifying.map((item) => estimatedRewardUsd(item, bnbUsd))),
    [buckets.qualifying, bnbUsd]
  );

  const wrongChain = chain?.id !== pumpChain.id;
  const isClaiming = Boolean(batchQueue) && (isPending || isConfirming);
  const claimProgress = batchQueue
    ? `${Math.min(batchIndex + 1, batchQueue.length)} / ${batchQueue.length}`
    : null;

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    setTargetsError(null);
    try {
      const results = await Promise.all(
        buckets.claimable.map((item) => fetchClaimTarget(item, address))
      );
      setTargets(results.filter((entry): entry is ClaimTarget => entry != null));
    } catch {
      setTargets([]);
      setTargetsError("Could not load claim proofs.");
    } finally {
      setTargetsLoading(false);
    }
  }, [address, buckets.claimable]);

  useEffect(() => {
    if (!open) {
      setTargets([]);
      setTargetsError(null);
      setBatchQueue(null);
      setBatchIndex(0);
      setClaimError(null);
      setClaimDone(false);
      handledTxRef.current = null;
      reset();
      return;
    }

    if (buckets.claimable.length === 0) {
      setTargets([]);
      return;
    }

    void loadTargets();
  }, [open, buckets.claimable, loadTargets, reset]);

  function chunkTargets(list: ClaimTarget[]): ClaimTarget[][] {
    const batches: ClaimTarget[][] = [];
    for (let i = 0; i < list.length; i += MAX_CLAIM_BATCH) {
      batches.push(list.slice(i, i + MAX_CLAIM_BATCH));
    }
    return batches;
  }

  function submitClaimBatch(batch: ClaimTarget[]) {
    if (!contracts.airdropManager) {
      setClaimError("Airdrop manager not configured.");
      return;
    }

    writeContract({
      address: contracts.airdropManager,
      abi: pumpAirdropManagerAbi,
      functionName: "claimBatch",
      args: [
        batch.map((target) => ({
          airdropId: BigInt(target.onChainId),
          amount: parseEther(target.amount),
          proof: target.proof,
        })),
      ],
      chainId: pumpChain.id,
    });
  }

  function startClaimAll() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongChain) {
      setClaimError("Switch to BSC Testnet to claim rewards.");
      return;
    }
    if (targets.length === 0) {
      setClaimError("No claimable rewards are ready right now.");
      return;
    }

    const batches = chunkTargets(targets);
    setClaimError(null);
    setClaimDone(false);
    setBatchQueue(batches);
    setBatchIndex(0);
    handledTxRef.current = null;
    reset();
    submitClaimBatch(batches[0]!);
  }

  useEffect(() => {
    if (!batchQueue || !txSuccess || !txHash) return;
    if (handledTxRef.current === txHash) return;
    handledTxRef.current = txHash;

    const nextIndex = batchIndex + 1;
    if (nextIndex < batchQueue.length) {
      setBatchIndex(nextIndex);
      reset();
      submitClaimBatch(batchQueue[nextIndex]!);
      return;
    }

    setBatchQueue(null);
    setClaimDone(true);
    onClaimed();
  }, [batchQueue, batchIndex, txSuccess, txHash, onClaimed, reset]);

  useEffect(() => {
    if (!writeError) return;
    setClaimError(writeError.message.split("\n")[0] ?? "Claim failed.");
    setBatchQueue(null);
  }, [writeError]);

  if (!open) return null;

  const canClaimNow = targets.length > 0 && !isClaiming && !claimDone;

  return (
    <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-all-airdrops-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="modal-panel relative w-full max-w-lg p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 border-b border-pump-border/45 pb-3">
            <div className="min-w-0">
              <h2 id="claim-all-airdrops-title" className="text-h3 font-semibold text-pump-text">
                Claim airdrop rewards
              </h2>
              <p className="mt-0.5 text-caption text-pump-muted">
                Review ready payouts and projected earnings from active campaigns.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-4 rounded-md border border-pump-accent/25 bg-pump-accent/5 p-3.5">
            <p className="section-label text-pump-accent">Ready to claim</p>
            <p className="mt-1 financial-value text-2xl font-semibold text-pump-text">
              {formatUsdReadable(claimableUsdTotal, { compact: false }) ?? "$0.00"}
            </p>
            <p className="mt-1 text-caption text-pump-muted">
              {targetsLoading
                ? "Checking claimable rewards…"
                : `${targets.length} of ${buckets.claimable.length} reward${buckets.claimable.length === 1 ? "" : "s"} ready`}
            </p>
          </div>

          {targets.length > 0 ? (
            <p className="mt-3 text-caption leading-snug text-pump-muted">
              Up to {MAX_CLAIM_BATCH} campaigns per transaction.
              {targets.length > MAX_CLAIM_BATCH
                ? ` Claim all needs ${Math.ceil(targets.length / MAX_CLAIM_BATCH)} wallet confirmation${Math.ceil(targets.length / MAX_CLAIM_BATCH) === 1 ? "" : "s"}.`
                : " Claim all uses a single transaction."}
            </p>
          ) : buckets.claimable.length > 0 && !targetsLoading ? (
            <p className="notice-warning mt-3">
              Rewards are marked claimable but proofs are not ready yet. Try again shortly.
            </p>
          ) : buckets.claimable.length === 0 ? (
            <p className="mt-3 text-caption text-pump-muted">
              Nothing is ready to claim yet. Check qualifying and finalizing campaigns below.
            </p>
          ) : null}

          {targetsError ? <p className="notice-error mt-3 text-caption">{targetsError}</p> : null}
          {claimError ? <p className="notice-error mt-3 text-caption">{claimError}</p> : null}
          {claimDone ? (
            <p className="mt-3 rounded-md border border-pump-success/30 bg-pump-success/10 px-3 py-2 text-caption text-pump-success">
              All available rewards were claimed successfully.
            </p>
          ) : null}

          <div className="scrollbar-subtle mt-4 max-h-[min(52vh,24rem)] space-y-4 overflow-y-auto overscroll-contain pr-1">
            {targets.length > 0 ? (
              <section>
                <p className="section-label">Ready now</p>
                <ul className="mt-1 divide-y divide-pump-border/10">
                  {targets.map((target) => {
                    const usd = claimableRewardUsd(target.item, bnbUsd);
                    const rewardLabel = formatAirdropReward(target.amount, {
                      isBnb: !target.item.rewardToken,
                      symbol: target.item.rewardSymbol,
                    });
                    return (
                      <CampaignRow
                        key={target.item.id}
                        item={target.item}
                        sub={rewardLabel}
                        trailing={<RewardBadge item={target.item} usd={usd} />}
                      />
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {buckets.qualifying.length > 0 ? (
              <section>
                <p className="section-label">Qualifying · not final</p>
                <p className="mt-1 text-caption leading-snug text-pump-muted">
                  Estimates use your current rank. Final rewards are set when the qualify window
                  ends and winners are ranked.
                </p>
                {estimatedQualifyingUsd > 0 ? (
                  <p className="mt-2 text-caption text-pump-muted">
                    Combined estimate{" "}
                    <span className="financial-value font-semibold text-pump-text">
                      {formatUsdReadable(estimatedQualifyingUsd, { compact: false })}
                    </span>
                  </p>
                ) : null}
                <ul className="mt-2 divide-y divide-pump-border/10">
                  {buckets.qualifying.map((item) => {
                    const rank = formatParticipantRankLabel(item.viewerRank, {
                      displayStatus: item.displayStatus,
                      onchainQualified: item.onchainQualified,
                    });
                    const estUsd = estimatedRewardUsd(item, bnbUsd);
                    const estLabel =
                      item.viewerRank != null && item.viewerRank >= 1 && item.viewerRank <= 100
                        ? formatProjectedRankReward(item.totalFunded, item.viewerRank, {
                            isBnb: !item.rewardToken,
                            symbol: item.rewardSymbol,
                          })
                        : null;

                    return (
                      <CampaignRow
                        key={item.id}
                        item={item}
                        sub={
                          rank !== "—"
                            ? `Rank ${rank}${estLabel ? ` · est. ${estLabel}` : ""}`
                            : "Rank pending"
                        }
                        trailing={<RewardBadge item={item} usd={estUsd} />}
                      />
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {buckets.finalizing.length > 0 ? (
              <section>
                <p className="section-label">Finalizing</p>
                <p className="mt-1 text-caption leading-snug text-pump-muted">
                  Qualify ended. Winners are being ranked and rewards are not claimable yet.
                </p>
                <ul className="mt-2 divide-y divide-pump-border/10">
                  {buckets.finalizing.map((item) => (
                    <CampaignRow
                      key={item.id}
                      item={item}
                      sub={formatAirdropDisplayStatus(item.displayStatus)}
                      trailing={
                        <span className="text-caption font-medium text-pump-warning">Pending</span>
                      }
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {buckets.claimed.length > 0 ? (
              <section>
                <p className="section-label">Already claimed</p>
                <ul className="mt-1 divide-y divide-pump-border/10">
                  {buckets.claimed.slice(0, 5).map((item) => (
                    <CampaignRow
                      key={item.id}
                      item={item}
                      sub="Claimed"
                      trailing={<span className="text-caption text-pump-muted">Done</span>}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={startClaimAll}
              disabled={!canClaimNow || wrongChain}
              className="primary-button flex flex-1 items-center justify-center gap-2 py-2.5 text-body-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isClaiming ? (
                <>
                  <span
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden
                  />
                  Claiming {claimProgress}
                </>
              ) : claimDone ? (
                "Claimed"
              ) : (
                `Claim all${targets.length > 0 ? ` (${targets.length})` : ""}`
              )}
            </button>
            <button type="button" onClick={onClose} className="secondary-button flex-1 py-2.5 text-body-sm">
              Close
            </button>
          </div>

          {!isConnected ? (
            <p className="mt-2 text-center text-caption text-pump-muted">
              <button
                type="button"
                onClick={() => openConnectModal?.()}
                className="font-medium text-pump-accent hover:underline"
              >
                Connect wallet
              </button>{" "}
              to claim rewards.
            </p>
          ) : wrongChain ? (
            <p className="mt-2 text-center text-caption text-pump-warning">
              Switch to BSC Testnet to claim.
            </p>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
