"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, type Address } from "viem";
import {
  useAccount,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { contracts, pumpChain } from "@/config/chain";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import {
  batchItemsForSellBatch,
  batchSellWriteArgs,
  buildSellBatchQueue,
  MAX_SELL_BATCH,
  signAllBatchSellPermits,
  type BatchSellItem,
} from "@/lib/batch-sell";
import type { PreparedBatchSellTarget, PrepareBatchSellResult } from "@/lib/batch-sell-prepare";
import {
  countCachedPermitsForTargets,
  persistPermitCache,
  removePermitsFromCache,
  restorePermitsForTargets,
} from "@/lib/batch-sell-permit-cache";
import { formatTradeError } from "@/lib/trade-errors";
import { formatUsdReadable } from "@/lib/format-usd";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { TokenAvatar } from "@/components/token/TokenAvatar";

export type SellAllHoldingInput = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
};

type SellAllHoldingsModalProps = {
  open: boolean;
  onClose: () => void;
  holdings: SellAllHoldingInput[];
  address: string;
  onSold: () => void;
};

async function fetchPreparedTargets(
  address: string,
  holdings: SellAllHoldingInput[]
): Promise<PrepareBatchSellResult> {
  const response = await fetch("/api/portfolio/batch-sell/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, holdings }),
    cache: "no-store",
  });
  const body = (await response.json()) as {
    data?: {
      targets: PreparedBatchSellTarget[];
      skipped: number;
      allowanceReadyCount: number;
      permitNeededCount: number;
    };
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to prepare batch sell");
  }
  return body.data ?? { targets: [], skipped: 0, allowanceReadyCount: 0, permitNeededCount: 0 };
}

export function SellAllHoldingsModal({
  open,
  onClose,
  holdings,
  address,
  onSold,
}: SellAllHoldingsModalProps) {
  const { openConnectModal } = useOpenConnectModal();
  const { isConnected, chain } = useAccount();
  const { bnbUsd } = useBnbUsdPrice();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [targets, setTargets] = useState<PreparedBatchSellTarget[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [allowanceReadyCount, setAllowanceReadyCount] = useState(0);
  const [permitNeededCount, setPermitNeededCount] = useState(0);
  const [cachedPermitCount, setCachedPermitCount] = useState(0);
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);
  const [sellDone, setSellDone] = useState(false);
  const [signingPermits, setSigningPermits] = useState(false);
  const [signProgress, setSignProgress] = useState<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<PreparedBatchSellTarget[][] | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const handledTxRef = useRef<string | null>(null);
  const signedPermitsRef = useRef<Map<string, BatchSellItem>>(new Map());

  const wrongChain = chain?.id !== pumpChain.id;
  const isSelling = Boolean(batchQueue) && (isPending || isConfirming);
  const isBusy = signingPermits || isSelling;
  const sellProgress = batchQueue
    ? `${Math.min(batchIndex + 1, batchQueue.length)} / ${batchQueue.length}`
    : null;

  const estimatedBnbTotal = useMemo(
    () => targets.reduce((sum, target) => sum + Number(formatEther(BigInt(target.estimatedZugOut))), 0),
    [targets]
  );

  const estimatedUsdTotal =
    bnbUsd != null && Number.isFinite(estimatedBnbTotal) ? estimatedBnbTotal * bnbUsd : null;

  const loadTargets = useCallback(async () => {
    setPrepareLoading(true);
    setPrepareError(null);
    try {
      const result = await fetchPreparedTargets(address, holdings);
      setTargets(result.targets);
      setSkipped(result.skipped);
      setAllowanceReadyCount(result.allowanceReadyCount);
      setPermitNeededCount(result.permitNeededCount);
      setCachedPermitCount(countCachedPermitsForTargets(address, pumpChain.id, result.targets));
    } catch (err) {
      setTargets([]);
      setSkipped(0);
      setAllowanceReadyCount(0);
      setPermitNeededCount(0);
      setCachedPermitCount(0);
      setPrepareError(err instanceof Error ? err.message : "Could not prepare sells.");
    } finally {
      setPrepareLoading(false);
    }
  }, [address, holdings]);

  useEffect(() => {
    if (!open) {
      setTargets([]);
      setSkipped(0);
      setAllowanceReadyCount(0);
      setPermitNeededCount(0);
      setCachedPermitCount(0);
      setPrepareError(null);
      setSellError(null);
      setSellDone(false);
      setSigningPermits(false);
      setSignProgress(null);
      setBatchQueue(null);
      setBatchIndex(0);
      signedPermitsRef.current = new Map();
      handledTxRef.current = null;
      reset();
      return;
    }

    if (holdings.length === 0) {
      setTargets([]);
      return;
    }

    void loadTargets();
  }, [open, holdings, loadTargets, reset]);

  const submitSellBatch = useCallback(
    (batch: PreparedBatchSellTarget[]) => {
      if (!address) {
        setSellError("Connect your wallet first.");
        return;
      }

      setSellError(null);

      try {
        const items = batchItemsForSellBatch(batch, signedPermitsRef.current);
        const { functionName, args } = batchSellWriteArgs(items);
        writeContract({
          address: contracts.bondingCurveManager,
          abi: bondingCurveManagerAbi,
          functionName,
          args: args as never,
          chainId: pumpChain.id,
        });
      } catch (err) {
        setSellError(formatTradeError(err));
        setBatchQueue(null);
      }
    },
    [address, writeContract]
  );

  const startSellAll = useCallback(async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongChain) {
      setSellError("Switch to BSC Testnet to sell holdings.");
      return;
    }
    if (targets.length === 0) {
      setSellError("No sellable holdings are ready right now.");
      return;
    }

    setSellError(null);
    setSellDone(false);
    handledTxRef.current = null;
    reset();

    const permitTargets = targets.filter(
      (target): target is PreparedBatchSellTarget & {
        tokenName: string;
        permitNonce: string;
      } => !target.hasAllowance && Boolean(target.tokenName && target.permitNonce != null)
    );

    try {
      const { restored, missing } = restorePermitsForTargets(address, pumpChain.id, targets);
      signedPermitsRef.current = restored;

      if (missing.length > 0) {
        setSigningPermits(true);
        setSignProgress(`0 / ${missing.length}`);
        signedPermitsRef.current = await signAllBatchSellPermits(
          missing.map((target) => ({
            tokenAddress: target.tokenAddress,
            symbol: target.symbol,
            tokenName: target.tokenName!,
            tokenIn: target.tokenIn,
            minZugOut: target.minZugOut,
            permitNonce: target.permitNonce!,
          })),
          {
            owner: address as Address,
            spender: contracts.bondingCurveManager,
            chainId: pumpChain.id,
            signTypedDataAsync,
            onProgress: (signed, total) => setSignProgress(`${signed} / ${total}`),
          },
          restored
        );

        const permitNonces: Record<string, string> = {};
        for (const target of permitTargets) {
          if (target.permitNonce) {
            permitNonces[target.tokenAddress.toLowerCase()] = target.permitNonce;
          }
        }
        persistPermitCache(address, pumpChain.id, signedPermitsRef.current, permitNonces);
        setSignProgress(null);
        setSigningPermits(false);
      }

      setCachedPermitCount(signedPermitsRef.current.size);

      const batches = buildSellBatchQueue(targets, MAX_SELL_BATCH);
      setBatchQueue(batches);
      setBatchIndex(0);
      submitSellBatch(batches[0]!);
    } catch (err) {
      setSigningPermits(false);
      setSignProgress(null);
      setSellError(formatTradeError(err));
      setBatchQueue(null);
    }
  }, [
    address,
    isConnected,
    openConnectModal,
    reset,
    signTypedDataAsync,
    submitSellBatch,
    targets,
    wrongChain,
  ]);

  useEffect(() => {
    if (!batchQueue || !txSuccess || !txHash) return;
    if (handledTxRef.current === txHash) return;
    handledTxRef.current = txHash;

    const nextIndex = batchIndex + 1;
    const soldBatch = batchQueue[batchIndex] ?? [];
    removePermitsFromCache(
      address,
      pumpChain.id,
      soldBatch.map((target) => target.tokenAddress)
    );
    for (const target of soldBatch) {
      signedPermitsRef.current.delete(target.tokenAddress.toLowerCase());
    }

    if (nextIndex < batchQueue.length) {
      setBatchIndex(nextIndex);
      reset();
      void submitSellBatch(batchQueue[nextIndex]!);
      return;
    }

    setBatchQueue(null);
    setSellDone(true);
    onSold();
  }, [batchQueue, batchIndex, txSuccess, txHash, onSold, reset, submitSellBatch, address]);

  useEffect(() => {
    if (!writeError) return;
    setSellError(formatTradeError(writeError));
    setBatchQueue(null);
  }, [writeError]);

  if (!open) return null;

  const batchCount = buildSellBatchQueue(targets, MAX_SELL_BATCH).length;
  const canSellNow = targets.length > 0 && !isBusy && !sellDone;

  return (
    <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sell-all-holdings-title"
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
              <h2 id="sell-all-holdings-title" className="text-h3 font-semibold text-pump-text">
                Sell all holdings
              </h2>
              <p className="mt-0.5 text-caption text-pump-muted">
                Exit every bonding-curve position in on-chain batches.
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

          <div className="mt-4 rounded-md border border-pump-danger/25 bg-pump-danger/5 p-3.5">
            <p className="section-label text-pump-danger">Estimated proceeds</p>
            <p className="mt-1 financial-value text-2xl font-semibold text-pump-text">
              {formatUsdReadable(estimatedUsdTotal, { compact: false }) ?? "—"}
            </p>
            <p className="mt-1 text-caption text-pump-muted">
              {prepareLoading
                ? "Quoting on-chain sells…"
                : `${targets.length} of ${holdings.length} holding${holdings.length === 1 ? "" : "s"} ready`}
              {skipped > 0 && !prepareLoading ? ` · ${skipped} skipped` : ""}
            </p>
          </div>

          {targets.length > 0 ? (
            <p className="mt-3 text-caption leading-snug text-pump-muted">
              Up to {MAX_SELL_BATCH} coins per transaction.
              {allowanceReadyCount > 0
                ? ` ${allowanceReadyCount} already approved — no permit signatures.`
                : ""}
              {permitNeededCount > 0
                ? cachedPermitCount > 0
                  ? ` ${cachedPermitCount} permit${cachedPermitCount === 1 ? "" : "s"} already signed this session (valid ~20 min).`
                  : ` ${permitNeededCount} permit${permitNeededCount === 1 ? "" : "s"} signed upfront in bulk, then only sell transactions.`
                : ""}
              {permitNeededCount > cachedPermitCount && cachedPermitCount > 0
                ? ` ${permitNeededCount - cachedPermitCount} new signature${permitNeededCount - cachedPermitCount === 1 ? "" : "s"} still needed.`
                : ""}
              {batchCount > 1
                ? ` Sell all needs ${batchCount} wallet confirmation${batchCount === 1 ? "" : "s"}.`
                : " Sell all uses a single transaction."}
            </p>
          ) : holdings.length > 0 && !prepareLoading ? (
            <p className="notice-warning mt-3">
              Holdings were found but none are sellable on the bonding curve right now.
            </p>
          ) : null}

          {prepareError ? <p className="notice-error mt-3">{prepareError}</p> : null}
          {sellError ? <p className="notice-error mt-3">{sellError}</p> : null}
          {sellDone ? (
            <p className="mt-3 text-caption text-pump-success">All batches submitted successfully.</p>
          ) : null}

          {targets.length > 0 ? (
            <ul className="mt-4 max-h-52 divide-y divide-pump-border/10 overflow-y-auto rounded-md border border-pump-border/20">
              {targets.slice(0, 12).map((target) => (
                <li
                  key={target.tokenAddress}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TokenAvatar
                      address={target.tokenAddress}
                      symbol={target.symbol}
                      logoUrl={target.logoUrl}
                      size={28}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium text-pump-text">
                        ${target.symbol}
                      </p>
                      <p className="truncate text-caption text-pump-muted">{target.name}</p>
                    </div>
                  </div>
                  <span className="financial-value shrink-0 text-caption text-pump-text">
                    {formatUsdReadable(
                      bnbUsd != null
                        ? Number(formatEther(BigInt(target.estimatedZugOut))) * bnbUsd
                        : null,
                      { compact: true }
                    ) ?? "—"}
                  </span>
                </li>
              ))}
              {targets.length > 12 ? (
                <li className="px-3 py-2 text-center text-caption text-pump-muted">
                  +{targets.length - 12} more
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={startSellAll}
              disabled={!canSellNow}
              className="primary-button flex-1 py-2.5 text-body-sm disabled:opacity-50"
            >
              {isBusy
                ? signingPermits
                  ? signProgress
                    ? `Signing permits ${signProgress}…`
                    : "Signing permits…"
                  : isPending
                    ? "Confirm sell in wallet…"
                    : `Selling batch ${sellProgress}…`
                : `Sell all${targets.length > 0 ? ` (${targets.length})` : ""}`}
            </button>
            <button type="button" onClick={onClose} className="secondary-button flex-1 py-2.5 text-body-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
