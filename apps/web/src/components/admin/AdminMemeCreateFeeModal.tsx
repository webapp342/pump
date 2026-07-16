"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { contracts, explorerTxUrl, NATIVE_SYMBOL, pumpChain, shortAddress } from "@/config/chain";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import { ModalPortal } from "@/components/ui/ModalPortal";

type AdminMemeCreateFeeModalProps = {
  open: boolean;
  onClose: () => void;
  currentFeeBnb: string;
  memeFactoryOwner: string;
  onUpdated: () => void;
};

export function AdminMemeCreateFeeModal({
  open,
  onClose,
  currentFeeBnb,
  memeFactoryOwner,
  onUpdated,
}: AdminMemeCreateFeeModalProps) {
  const { address, chain } = useAccount();
  const [bnbInput, setBnbInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const canEdit =
    Boolean(address) && address!.toLowerCase() === memeFactoryOwner.toLowerCase();

  const { data: configReads } = useReadContracts({
    contracts: [
      {
        address: contracts.memeFactory,
        abi: memeFactoryAbi,
        functionName: "treasury",
        chainId: pumpChain.id,
      },
      {
        address: contracts.memeFactory,
        abi: memeFactoryAbi,
        functionName: "bondingCurveManager",
        chainId: pumpChain.id,
      },
      {
        address: contracts.memeFactory,
        abi: memeFactoryAbi,
        functionName: "defaultTotalSupply",
        chainId: pumpChain.id,
      },
      {
        address: contracts.memeFactory,
        abi: memeFactoryAbi,
        functionName: "defaultVirtualEthReserve",
        chainId: pumpChain.id,
      },
      {
        address: contracts.memeFactory,
        abi: memeFactoryAbi,
        functionName: "defaultVirtualTokenReserve",
        chainId: pumpChain.id,
      },
    ],
    query: { enabled: open },
  });

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

    const treasury = configReads?.[0]?.result;
    const bondingCurveManager = configReads?.[1]?.result;
    const defaultTotalSupply = configReads?.[2]?.result;
    const defaultVirtualEthReserve = configReads?.[3]?.result;
    const defaultVirtualTokenReserve = configReads?.[4]?.result;

    if (
      treasury == null ||
      bondingCurveManager == null ||
      defaultTotalSupply == null ||
      defaultVirtualEthReserve == null ||
      defaultVirtualTokenReserve == null
    ) {
      setLocalError("Loading factory config — try again in a moment");
      return;
    }

    writeContract({
      address: contracts.memeFactory,
      abi: memeFactoryAbi,
      functionName: "setConfig",
      args: [
        treasury,
        bondingCurveManager,
        newFeeWei,
        defaultTotalSupply,
        defaultVirtualEthReserve,
        defaultVirtualTokenReserve,
      ],
      chainId: pumpChain.id,
    });
  }

  const wrongChain = chain?.id !== pumpChain.id;
  const configReady = configReads?.every((item) => item.status === "success") ?? false;

  return (
    <ModalPortal open={open}>
    <div
      className="modal-backdrop modal-backdrop-shell z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-meme-create-fee-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="panel-surface relative w-full max-w-md p-5 shadow-panel">
        <h2 id="admin-meme-create-fee-title" className="text-h2 font-semibold text-pump-text">
          Meme launch fee
        </h2>
        <p className="mt-1 text-sm text-pump-muted">
          Flat {NATIVE_SYMBOL} fee charged when someone launches a new token. Paid entirely to the treasury.
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
            MemeFactory owner wallet required ({shortAddress(memeFactoryOwner)}).
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
            disabled={!canEdit || !configReady || wrongChain || isPending || isConfirming}
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
