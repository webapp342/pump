"use client";

import { useEffect, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { contracts, explorerTxUrl, pumpChain, shortAddress } from "@/config/chain";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import {
  creatorShareBpsToPercent,
  percentToReferrerShareBps,
  referrerShareBpsToPercent,
  treasurySharePercentFromSplit,
} from "@/lib/trade-fee-config";
import { ModalPortal } from "@/components/ui/ModalPortal";

type AdminReferrerShareModalProps = {
  open: boolean;
  onClose: () => void;
  currentReferrerShareBps: number;
  creatorFeeShareBps: number;
  protocolFeeBps: number;
  bondingOwner: string;
  onUpdated: () => void;
};

export function AdminReferrerShareModal({
  open,
  onClose,
  currentReferrerShareBps,
  creatorFeeShareBps,
  protocolFeeBps,
  bondingOwner,
  onUpdated,
}: AdminReferrerShareModalProps) {
  const { address, chain } = useAccount();
  const [percentInput, setPercentInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const canEdit =
    Boolean(address) &&
    address!.toLowerCase() === bondingOwner.toLowerCase();

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!open) return;
    setPercentInput(referrerShareBpsToPercent(currentReferrerShareBps).toFixed(2));
    setLocalError(null);
    reset();
  }, [open, currentReferrerShareBps, reset]);

  useEffect(() => {
    if (!isSuccess) return;
    onUpdated();
    onClose();
  }, [isSuccess, onUpdated, onClose]);

  if (!open) return null;

  const previewReferrerBps = (() => {
    const percent = Number(percentInput);
    if (!Number.isFinite(percent) || percent < 0) return null;
    return percentToReferrerShareBps(percent);
  })();

  function handleSubmit() {
    setLocalError(null);
    const percent = Number(percentInput);
    if (!Number.isFinite(percent) || percent < 0) {
      setLocalError("Enter a valid referrer share percentage");
      return;
    }

    const shareBps = percentToReferrerShareBps(percent);
    if (creatorFeeShareBps + shareBps > 10_000) {
      setLocalError(
        `Creator (${creatorShareBpsToPercent(creatorFeeShareBps).toFixed(2)}%) + referrer must not exceed 100% of the protocol fee`
      );
      return;
    }

    if (shareBps === currentReferrerShareBps) {
      setLocalError("New value matches the current on-chain share");
      return;
    }

    writeContract({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "setReferrerShareBps",
      args: [BigInt(shareBps)],
      chainId: pumpChain.id,
    });
  }

  const wrongChain = chain?.id !== pumpChain.id;
  const maxReferrerBps = 10_000 - creatorFeeShareBps;
  const maxPercent = referrerShareBpsToPercent(maxReferrerBps);
  const treasuryPct =
    previewReferrerBps != null
      ? treasurySharePercentFromSplit(creatorFeeShareBps, previewReferrerBps)
      : treasurySharePercentFromSplit(creatorFeeShareBps, currentReferrerShareBps);
  const referrerPct =
    previewReferrerBps != null
      ? referrerShareBpsToPercent(previewReferrerBps)
      : referrerShareBpsToPercent(currentReferrerShareBps);
  const creatorPct = creatorShareBpsToPercent(creatorFeeShareBps);
  const protocolPct = protocolFeeBps / 100;

  return (
    <ModalPortal open={open}>
    <div
      className="modal-backdrop modal-backdrop-shell z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-referrer-share-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="panel-surface relative w-full max-w-md p-5 shadow-panel">
        <h2 id="admin-referrer-share-title" className="text-h2 font-semibold text-pump-text">
          Referrer fee share
        </h2>
        <p className="mt-1 text-sm text-pump-muted">
          Share of the protocol fee paid to the trader&apos;s referrer when they were invited before
          their first trade. Treasury receives the automatic remainder.
        </p>

        <div className="mt-4 rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
          <p className="section-label">Current split of protocol fee</p>
          <p className="mt-1 text-body-sm text-pump-text">
            Creator{" "}
            <span className="financial-value font-semibold">{creatorPct.toFixed(2)}%</span>
            {" · "}
            Referrer{" "}
            <span className="financial-value font-semibold">
              {referrerShareBpsToPercent(currentReferrerShareBps).toFixed(2)}%
            </span>
            {" · "}
            Treasury{" "}
            <span className="financial-value font-semibold">
              {treasurySharePercentFromSplit(creatorFeeShareBps, currentReferrerShareBps).toFixed(2)}%
            </span>
          </p>
        </div>

        <label className="mt-4 block">
          <span className="section-label">Referrer share (% of protocol fee)</span>
          <input
            type="number"
            min={0}
            max={maxPercent}
            step={0.01}
            value={percentInput}
            onChange={(e) => setPercentInput(e.target.value)}
            disabled={!canEdit || isPending || isConfirming}
            className="field-input mt-2 h-10 w-full bg-pump-bg/80"
          />
        </label>

        <div className="mt-3 rounded-md border border-pump-accent/20 bg-pump-accent/5 px-3 py-2.5 text-caption text-pump-muted">
          <p>
            Effective on each referred trade (at {protocolPct.toFixed(2)}% protocol fee): creator ~
            {((protocolPct * creatorPct) / 100).toFixed(3)}%, referrer ~
            {((protocolPct * referrerPct) / 100).toFixed(3)}%, treasury ~
            {((protocolPct * treasuryPct) / 100).toFixed(3)}%
          </p>
        </div>

        {!canEdit ? (
          <p className="mt-3 text-caption text-pump-muted">
            BondingCurveManager owner wallet required ({shortAddress(bondingOwner)}).
          </p>
        ) : null}

        {wrongChain ? (
          <p className="mt-3 text-sm text-pump-warning">Switch to the launchpad network to submit.</p>
        ) : null}

        {localError ? <p className="notice-error mt-3">{localError}</p> : null}
        {writeError ? (
          <p className="notice-error mt-3">{writeError.message.split("\n")[0]}</p>
        ) : null}

        {txHash ? (
          <p className="mt-3 text-caption text-pump-muted">
            Tx{" "}
            <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="text-pump-accent hover:underline">
              {shortAddress(txHash)}
            </a>
            {isConfirming ? " · confirming…" : isSuccess ? " · confirmed" : ""}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="secondary-button flex-1 py-2.5">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canEdit || wrongChain || isPending || isConfirming}
            onClick={() => handleSubmit()}
            className="primary-button flex-1 py-2.5"
          >
            {isPending || isConfirming ? "Updating…" : "Update on-chain"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
