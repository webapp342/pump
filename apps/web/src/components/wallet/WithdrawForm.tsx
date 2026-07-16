"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { NATIVE_SYMBOL, pumpChain } from "@/config/chain";
import { PumpAmountPresets } from "@/components/token/PumpAmountPresets";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { WithdrawAssetPicker } from "@/components/wallet/WithdrawAssetPicker";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useWithdrawAssets } from "@/hooks/useWithdrawAssets";
import { bnbToUsd, formatPortfolioHoldingValueUsd } from "@/lib/format-usd";
import { invalidateScwBalance } from "@/lib/scw-balance-sync";
import { formatTradeError } from "@/lib/trade-errors";
import {
  computeMaxNativeWithdrawWei,
  formatWithdrawDisplayBalance,
  formatWithdrawInputAmount,
  parseWithdrawAmount,
  withdrawAmountFromPercent,
  type WithdrawAsset,
} from "@/lib/withdraw-assets";

type WithdrawFormProps = {
  onClose: () => void;
  /** When true, Cancel/Withdraw live in the parent sheet footer. */
  hideActions?: boolean;
  formId?: string;
  onUiChange?: (ui: { pending: boolean; canSubmit: boolean }) => void;
};

type ActivePreset = number | "max" | null;

export function WithdrawForm({
  onClose,
  hideActions = false,
  formId = "pump-withdraw-form",
  onUiChange,
}: WithdrawFormProps) {
  const { scwAddress, withdraw, withdrawToken } = usePumpWallet();
  const { bnbUsd } = useBnbUsdPrice();
  const { assets, loading, error: loadError, reload } = useWithdrawAssets(scwAddress, true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [activePreset, setActivePreset] = useState<ActivePreset>(null);
  const [maxNativeWei, setMaxNativeWei] = useState<bigint | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null,
    [assets, selectedId]
  );

  useEffect(() => {
    if (assets.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !assets.some((asset) => asset.id === selectedId)) {
      setSelectedId(assets[0]!.id);
    }
  }, [assets, selectedId]);

  useEffect(() => {
    setAmount("");
    setActivePreset(null);
    setError(null);
    setTxHash(null);
  }, [selectedAsset?.id]);

  useEffect(() => {
    if (!selectedAsset || selectedAsset.kind !== "native") {
      setMaxNativeWei(null);
      return;
    }
    let cancelled = false;
    void computeMaxNativeWithdrawWei(selectedAsset.balanceWei).then((value) => {
      if (!cancelled) setMaxNativeWei(value);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedAsset]);

  const spendableWei = useMemo(() => {
    if (!selectedAsset) return 0n;
    if (selectedAsset.kind === "token") return selectedAsset.balanceWei;
    return maxNativeWei ?? 0n;
  }, [selectedAsset, maxNativeWei]);

  const amountWei = useMemo(() => parseWithdrawAmount(amount), [amount]);

  const amountUsd = useMemo(() => {
    if (!selectedAsset || amountWei == null) return null;
    if (selectedAsset.kind === "native") {
      const n = Number(formatWithdrawDisplayBalance(amountWei));
      return bnbToUsd(n, bnbUsd);
    }
    const total = Number(formatWithdrawDisplayBalance(selectedAsset.balanceWei));
    const unitPrice = total > 0 ? selectedAsset.estimatedValueBnb / total : 0;
    const n = Number(formatWithdrawDisplayBalance(amountWei));
    return bnbToUsd(n * unitPrice, bnbUsd);
  }, [amountWei, bnbUsd, selectedAsset]);

  const resolveSubmitAmountWei = useCallback((): bigint | null => {
    if (!selectedAsset) return null;
    if (activePreset === "max") return spendableWei;
    if (typeof activePreset === "number") {
      const basis =
        selectedAsset.kind === "native" && maxNativeWei != null
          ? maxNativeWei
          : selectedAsset.balanceWei;
      const wei = withdrawAmountFromPercent(basis, activePreset);
      return wei > 0n ? wei : null;
    }
    return parseWithdrawAmount(amount);
  }, [activePreset, amount, maxNativeWei, selectedAsset, spendableWei]);

  const applyPreset = useCallback(
    async (preset: ActivePreset) => {
      if (!selectedAsset || !preset) return;
      setActivePreset(preset);

      let wei: bigint;
      if (preset === "max") {
        if (selectedAsset.kind === "native") {
          wei = maxNativeWei ?? (await computeMaxNativeWithdrawWei(selectedAsset.balanceWei));
          setMaxNativeWei(wei);
        } else {
          wei = selectedAsset.balanceWei;
        }
      } else {
        const basis =
          selectedAsset.kind === "native" && maxNativeWei != null
            ? maxNativeWei
            : selectedAsset.balanceWei;
        wei = withdrawAmountFromPercent(basis, preset);
      }

      setAmount(formatWithdrawInputAmount(wei));
    },
    [maxNativeWei, selectedAsset]
  );

  const onSelectAsset = useCallback((asset: WithdrawAsset) => {
    setSelectedId(asset.id);
  }, []);

  const availableLabel = useMemo(() => {
    if (!selectedAsset || spendableWei <= 0n) return null;
    return {
      balance: formatWithdrawDisplayBalance(spendableWei),
      symbol: selectedAsset.symbol,
    };
  }, [selectedAsset, spendableWei]);

  const canSubmit = Boolean(selectedAsset && spendableWei > 0n && !pending);

  useEffect(() => {
    onUiChange?.({ pending, canSubmit });
  }, [canSubmit, onUiChange, pending]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setTxHash(null);

    if (!selectedAsset) {
      setError("Select an asset to withdraw.");
      return;
    }

    const trimmed = destination.trim();
    if (!isAddress(trimmed)) {
      setError("Enter a valid destination address.");
      return;
    }

    const value = resolveSubmitAmountWei();
    if (value == null) {
      setError("Enter a valid amount.");
      return;
    }
    if (value > spendableWei) {
      setError(
        selectedAsset.kind === "native"
          ? `Amount exceeds available ${NATIVE_SYMBOL} after network fee reserve.`
          : "Amount exceeds available balance."
      );
      return;
    }

    setPending(true);
    try {
      let hash: Address;
      if (selectedAsset.kind === "native") {
        hash = await withdraw(trimmed as Address, value);
      } else if (!selectedAsset.tokenAddress) {
        throw new Error("Token address missing.");
      } else {
        hash = await withdrawToken(selectedAsset.tokenAddress, trimmed as Address, value);
      }
      setTxHash(hash);
      invalidateScwBalance();
      void reload();
    } catch (err) {
      setError(formatTradeError(err));
    } finally {
      setPending(false);
    }
  }

  if (loading && assets.length === 0) {
    return (
      <div className="wallet-funding-withdraw wallet-funding-withdraw--loading" aria-busy="true">
        <Skeleton variant="line" className="h-16 w-full rounded-lg" />
        <Skeleton variant="line" className="h-11 w-full rounded-lg" />
        <Skeleton variant="line" className="h-11 w-full rounded-lg" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} variant="line" className="h-9 rounded-md" />
          ))}
        </div>
        <Skeleton variant="line" className="h-11 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={(event) => void onSubmit(event)}
      className="wallet-funding-withdraw"
    >
      {loadError ? <p className="wallet-funding-sheet__notice notice-warning leading-snug">{loadError}</p> : null}

      <div className="wallet-funding-field">
        <span className="field-label">Asset</span>
        <WithdrawAssetPicker
          assets={assets}
          selectedId={selectedId}
          onSelect={onSelectAsset}
          disabled={pending || assets.length === 0}
        />
      </div>

      <div className="wallet-funding-field">
        <div className="wallet-funding-withdraw__amount-head">
          <label className="field-label" htmlFor="withdraw-amount">
            Amount
          </label>
          {availableLabel ? (
            <span className="wallet-funding-withdraw__available">
              Available{" "}
              <span className="financial-value">
                {availableLabel.balance} {availableLabel.symbol}
              </span>
            </span>
          ) : null}
        </div>
        <input
          id="withdraw-amount"
          className="field-input wallet-funding-withdraw__amount-input w-full"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setActivePreset(null);
          }}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          disabled={!selectedAsset || pending}
        />
        {amountUsd != null && amountWei != null ? (
          <p className="field-hint financial-value">
            ≈ {formatPortfolioHoldingValueUsd(amountUsd)}
          </p>
        ) : null}
        <PumpAmountPresets
          side="sell"
          activePreset={activePreset}
          disabled={!selectedAsset || pending}
          maxDisabled={!selectedAsset || spendableWei <= 0n}
          presetsDisabled={!selectedAsset || spendableWei <= 0n}
          onPresetPercent={(pct) => void applyPreset(pct)}
          onMax={() => void applyPreset("max")}
        />
      </div>

      <div className="wallet-funding-field">
        <label className="field-label" htmlFor="withdraw-destination">
          Destination address
        </label>
        <input
          id="withdraw-destination"
          className="field-input w-full"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="0x…"
          autoComplete="off"
          disabled={pending}
        />
        <p className="field-hint">
          Network fees are paid from your {NATIVE_SYMBOL} balance on {pumpChain.name}.
        </p>
      </div>

      {error ? <p className="wallet-funding-sheet__notice notice-warning leading-snug">{error}</p> : null}
      {txHash ? (
        <p className="wallet-funding-sheet__notice text-caption text-pump-success">
          Withdrawal submitted.{" "}
          <a
            href={`${pumpChain.blockExplorers.default.url}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pump-accent hover:underline"
          >
            View tx
          </a>
        </p>
      ) : null}

      {hideActions ? null : (
        <div className="wallet-funding-withdraw__actions">
          <button type="button" onClick={onClose} className="secondary-button w-full" disabled={pending}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button w-full"
            disabled={pending || !selectedAsset || spendableWei <= 0n}
          >
            {pending ? "Sending…" : "Withdraw"}
          </button>
        </div>
      )}
    </form>
  );
}
