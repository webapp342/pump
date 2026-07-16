"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import {
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { contracts, NATIVE_SYMBOL, pumpChain } from "@/config/chain";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import { MAX_MIN_INITIAL_BUY_BNB } from "@/lib/platform-settings";

type AdminMinInitialBuyModalProps = {
  open: boolean;
  onClose: () => void;
  currentMinBnb: string;
  adminAddress: string;
  onUpdated: () => void;
};

export function AdminMinInitialBuyModal({
  open,
  onClose,
  currentMinBnb,
  adminAddress,
  onUpdated,
}: AdminMinInitialBuyModalProps) {
  const [bnbInput, setBnbInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!open) return;
    setBnbInput(currentMinBnb);
    setLocalError(null);
    reset();
  }, [open, currentMinBnb, reset]);

  useEffect(() => {
    if (!isSuccess) return;
    onUpdated();
    onClose();
  }, [isSuccess, onUpdated, onClose]);

  useEffect(() => {
    if (!writeError) return;
    setLocalError(writeError.message.split("\n")[0] ?? "Transaction failed");
  }, [writeError]);

  if (!open) return null;

  const saving = isPending || isConfirming;

  function handleSubmit() {
    setLocalError(null);

    const trimmed = bnbInput.trim();
    if (!trimmed) {
      setLocalError("Enter a minimum amount.");
      return;
    }

    let minWei: bigint;
    try {
      minWei = parseEther(trimmed);
    } catch {
      setLocalError(`Enter a valid ${NATIVE_SYMBOL} amount.`);
      return;
    }

    const maxWei = parseEther(MAX_MIN_INITIAL_BUY_BNB);
    if (minWei > maxWei) {
      setLocalError(`Maximum is ${MAX_MIN_INITIAL_BUY_BNB} ${NATIVE_SYMBOL}.`);
      return;
    }

    writeContract({
      address: contracts.memeFactory,
      abi: memeFactoryAbi,
      functionName: "setMinInitialBuyWei",
      args: [minWei],
      chainId: pumpChain.id,
    });
  }

  return (
    <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-min-initial-buy-title"
      >
        <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
        <div className="panel-surface relative w-full max-w-md p-5 shadow-panel">
          <h2 id="admin-min-initial-buy-title" className="text-h2 font-semibold text-pump-text">
            Minimum initial buy
          </h2>
          <p className="mt-1 text-sm text-pump-muted">
            On-chain rule on MemeFactory. Creators must include at least this much {NATIVE_SYMBOL} in the
            initial buy (in addition to the meme launch fee, unless fee-exempt).
          </p>

          <div className="mt-4 rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <p className="section-label">Current value</p>
            <p className="financial-value mt-1 text-body-sm font-semibold text-pump-text">
              {currentMinBnb} {NATIVE_SYMBOL}
            </p>
          </div>

          <label className="mt-4 block">
            <span className="section-label">New minimum ({NATIVE_SYMBOL})</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.01"
              value={bnbInput}
              onChange={(e) => setBnbInput(e.target.value)}
              disabled={saving}
              className="field-input mt-2 h-10 w-full bg-pump-bg/80"
            />
          </label>

          <p className="mt-2 text-caption text-pump-muted">
            Set to 0 to disable the minimum. Max {MAX_MIN_INITIAL_BUY_BNB} {NATIVE_SYMBOL}. Requires MemeFactory
            owner wallet.
          </p>

          {localError ? <p className="notice-error mt-3">{localError}</p> : null}

          <div className="mt-5 flex gap-3">
            <button type="button" onClick={onClose} className="secondary-button flex-1 py-2.5">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit()}
              className="primary-button flex-1 py-2.5"
            >
              {saving ? "Confirming…" : "Save on-chain"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
