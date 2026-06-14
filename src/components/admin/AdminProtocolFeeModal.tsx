"use client";

import { useEffect, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { contracts, explorerTxUrl, pumpChain, shortAddress } from "@/config/chain";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import {
  MAX_PROTOCOL_FEE_BPS,
  percentToProtocolFeeBps,
  protocolFeeBpsToPercent,
} from "@/lib/trade-fee-config";
import { ModalPortal } from "@/components/ui/ModalPortal";

type AdminProtocolFeeModalProps = {
  open: boolean;
  onClose: () => void;
  currentProtocolFeeBps: number;
  bondingOwner: string;
  onUpdated: () => void;
};

export function AdminProtocolFeeModal({
  open,
  onClose,
  currentProtocolFeeBps,
  bondingOwner,
  onUpdated,
}: AdminProtocolFeeModalProps) {
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
    setPercentInput(protocolFeeBpsToPercent(currentProtocolFeeBps).toFixed(2));
    setLocalError(null);
    reset();
  }, [open, currentProtocolFeeBps, reset]);

  useEffect(() => {
    if (!isSuccess) return;
    onUpdated();
    onClose();
  }, [isSuccess, onUpdated, onClose]);

  if (!open) return null;

  function handleSubmit() {
    setLocalError(null);
    const percent = Number(percentInput);
    if (!Number.isFinite(percent) || percent < 0) {
      setLocalError("Enter a valid fee percentage");
      return;
    }

    const feeBps = percentToProtocolFeeBps(percent);
    if (feeBps > MAX_PROTOCOL_FEE_BPS) {
      setLocalError(`Maximum protocol fee is ${protocolFeeBpsToPercent(MAX_PROTOCOL_FEE_BPS)}%`);
      return;
    }

    if (feeBps === currentProtocolFeeBps) {
      setLocalError("New value matches the current on-chain fee");
      return;
    }

    writeContract({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "setProtocolFeeBps",
      args: [BigInt(feeBps)],
      chainId: pumpChain.id,
    });
  }

  const wrongChain = chain?.id !== pumpChain.id;
  const maxPercent = protocolFeeBpsToPercent(MAX_PROTOCOL_FEE_BPS);

  return (
    <ModalPortal open={open}>
    <div
      className="modal-backdrop modal-backdrop-shell z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-protocol-fee-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="panel-surface relative w-full max-w-md p-5 shadow-panel">
        <h2 id="admin-protocol-fee-title" className="text-h2 font-semibold text-pump-text">
          Protocol trade fee
        </h2>
        <p className="mt-1 text-sm text-pump-muted">
          Total fee taken on each buy/sell before split between creator and treasury. On-chain max{" "}
          {maxPercent}%.
        </p>

        <div className="mt-4 rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
          <p className="section-label">Current on-chain</p>
          <p className="financial-value mt-1 text-body-sm font-semibold text-pump-text">
            {protocolFeeBpsToPercent(currentProtocolFeeBps).toFixed(2)}%
          </p>
        </div>

        <label className="mt-4 block">
          <span className="section-label">New fee (% of trade)</span>
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
