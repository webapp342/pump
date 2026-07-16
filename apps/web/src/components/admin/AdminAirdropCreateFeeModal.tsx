"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { contracts, explorerTxUrl, NATIVE_SYMBOL, pumpChain, shortAddress } from "@/config/chain";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { ModalPortal } from "@/components/ui/ModalPortal";

type AdminAirdropCreateFeeModalProps = {
  open: boolean;
  onClose: () => void;
  currentFeeBnb: string;
  airdropAdmin: string;
  onUpdated: () => void;
};

export function AdminAirdropCreateFeeModal({
  open,
  onClose,
  currentFeeBnb,
  airdropAdmin,
  onUpdated,
}: AdminAirdropCreateFeeModalProps) {
  const { address, chain } = useAccount();
  const [bnbInput, setBnbInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const canEdit =
    Boolean(address) && address!.toLowerCase() === airdropAdmin.toLowerCase();

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!open) return;
    setBnbInput(currentFeeBnb);
    setLocalError(null);
    reset();
  }, [open, currentFeeBnb, reset]);

  useEffect(() => {
    if (!isSuccess) return;
    onUpdated();
    onClose();
  }, [isSuccess, onUpdated, onClose]);

  if (!open) return null;

  if (!contracts.airdropManager) {
    return (
      <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-50"
        role="dialog"
        aria-modal="true"
      >
        <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
        <div className="panel-surface relative w-full max-w-md p-5 shadow-panel">
          <p className="text-body-sm text-pump-muted">AirdropManager is not configured on this deployment.</p>
          <button type="button" onClick={onClose} className="primary-button mt-4 w-full py-2.5">
            Close
          </button>
        </div>
      </div>
      </ModalPortal>
    );
  }

  function handleSubmit() {
    setLocalError(null);

    let newFeeWei: bigint;
    try {
      newFeeWei = parseEther(bnbInput.trim() || "0");
    } catch {
      setLocalError(`Enter a valid ${NATIVE_SYMBOL} amount`);
      return;
    }

    const currentWei = parseEther(currentFeeBnb || "0");
    if (newFeeWei === currentWei) {
      setLocalError("New value matches the current on-chain fee");
      return;
    }

    if (!contracts.airdropManager) {
      setLocalError("AirdropManager is not configured");
      return;
    }

    writeContract({
      address: contracts.airdropManager,
      abi: pumpAirdropManagerAbi,
      functionName: "setCreateFee",
      args: [newFeeWei],
      chainId: pumpChain.id,
    });
  }

  const wrongChain = chain?.id !== pumpChain.id;

  return (
    <ModalPortal open={open}>
    <div
      className="modal-backdrop modal-backdrop-shell z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-airdrop-create-fee-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="panel-surface relative w-full max-w-md p-5 shadow-panel">
        <h2 id="admin-airdrop-create-fee-title" className="text-h2 font-semibold text-pump-text">
          Airdrop create fee
        </h2>
        <p className="mt-1 text-sm text-pump-muted">
          Flat {NATIVE_SYMBOL} fee charged when someone creates an airdrop campaign. Paid entirely to the treasury
          (separate from the reward pool).
        </p>

        <div className="mt-4 rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
          <p className="section-label">Current on-chain</p>
          <p className="financial-value mt-1 text-body-sm font-semibold text-pump-text">
            {currentFeeBnb} {NATIVE_SYMBOL}
          </p>
        </div>

        <label className="mt-4 block">
          <span className="section-label">New fee ({NATIVE_SYMBOL})</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.001"
            value={bnbInput}
            onChange={(e) => setBnbInput(e.target.value)}
            disabled={!canEdit || isPending || isConfirming}
            className="field-input mt-2 h-10 w-full bg-pump-bg/80"
          />
        </label>

        {!canEdit ? (
          <p className="mt-3 text-caption text-pump-muted">
            AirdropManager admin wallet required ({shortAddress(airdropAdmin)}).
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
            <a
              href={explorerTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pump-accent hover:underline"
            >
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
