"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { NATIVE_SYMBOL, shortSolanaAddress, SOLANA_CLUSTER } from "@/config/solana";
import { PumpAmountPresets } from "@/components/token/PumpAmountPresets";
import {
  hydrateSolanaSilentSession,
  type SolanaSilentSession,
} from "@/lib/solana/silent-session";
import {
  computeMaxSolWithdrawLamports,
  fetchSolBalanceLamports,
  isValidSolanaAddress,
  lamportsToSol,
  solToLamports,
  withdrawSol,
} from "@/lib/solana/transfer";
import { explorerTxUrl } from "@/config/solana-explorer";

type SolanaWithdrawFormProps = {
  onClose: () => void;
  hideActions?: boolean;
  formId?: string;
  onUiChange?: (ui: { pending: boolean; canSubmit: boolean }) => void;
};

type ActivePreset = number | "max" | null;

function formatSol(lamports: bigint): string {
  const n = lamportsToSol(lamports);
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toFixed(9);
}

export function SolanaWithdrawForm({
  onClose,
  hideActions = false,
  formId = "pump-solana-withdraw-form",
  onUiChange,
}: SolanaWithdrawFormProps) {
  const [wallet, setWallet] = useState<SolanaSilentSession | null>(null);
  const [balanceLamports, setBalanceLamports] = useState<bigint>(0n);
  const [maxLamports, setMaxLamports] = useState<bigint>(0n);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [activePreset, setActivePreset] = useState<ActivePreset>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const w = await hydrateSolanaSilentSession();
      setWallet(w);
      const bal = await fetchSolBalanceLamports(w.address);
      setBalanceLamports(bal);
      setMaxLamports(await computeMaxSolWithdrawLamports(bal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Solana wallet");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const amountLamports = useMemo(() => {
    if (activePreset === "max") return maxLamports;
    if (typeof activePreset === "number") {
      return (maxLamports * BigInt(activePreset)) / 100n;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return solToLamports(n);
  }, [activePreset, amount, maxLamports]);

  const canSubmit =
    !pending &&
    !loading &&
    wallet != null &&
    isValidSolanaAddress(destination) &&
    amountLamports != null &&
    amountLamports > 0n &&
    amountLamports <= maxLamports;

  useEffect(() => {
    onUiChange?.({ pending, canSubmit });
  }, [pending, canSubmit, onUiChange]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!wallet || !canSubmit || amountLamports == null) return;
    setPending(true);
    setError(null);
    setTxSig(null);
    try {
      const sig = await withdrawSol({
        secretKeyBase64: wallet.secretKeyBase64,
        to: destination,
        lamports: amountLamports,
      });
      setTxSig(sig);
      setAmount("");
      setActivePreset(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form id={formId} className="wallet-funding-withdraw" onSubmit={(e) => void onSubmit(e)}>
      <p className="field-hint">
        Send SOL from your Pump wallet on {SOLANA_CLUSTER}. You pay the network fee.
      </p>

      <label className="field-label" htmlFor="solana-withdraw-to">
        Destination
      </label>
      <input
        id="solana-withdraw-to"
        className="field-input"
        placeholder="Solana address"
        value={destination}
        onChange={(ev) => setDestination(ev.target.value.trim())}
        autoComplete="off"
        spellCheck={false}
        disabled={pending}
      />

      <div className="wallet-funding-withdraw__amount-head">
        <label className="field-label" htmlFor="solana-withdraw-amount">
          Amount ({NATIVE_SYMBOL})
        </label>
        <span className="field-hint financial-value">
          {loading ? "…" : `Avail ${formatSol(balanceLamports)} ${NATIVE_SYMBOL}`}
        </span>
      </div>
      <input
        id="solana-withdraw-amount"
        className="field-input"
        inputMode="decimal"
        placeholder="0.0"
        value={activePreset === "max" ? formatSol(maxLamports) : amount}
        onChange={(ev) => {
          setActivePreset(null);
          setAmount(ev.target.value);
        }}
        disabled={pending || loading}
      />
      <PumpAmountPresets
        activePreset={activePreset}
        disabled={pending || loading || maxLamports <= 0n}
        onPresetPercent={(pct) => {
          setActivePreset(pct);
          setAmount(formatSol((maxLamports * BigInt(pct)) / 100n));
        }}
        onMax={() => {
          setActivePreset("max");
          setAmount(formatSol(maxLamports));
        }}
      />

      {wallet ? (
        <p className="field-hint">
          From {shortSolanaAddress(wallet.address)}
        </p>
      ) : null}

      {error ? <p className="notice-danger text-caption">{error}</p> : null}
      {txSig ? (
        <p className="notice-success text-caption">
          Sent.{" "}
          <a href={explorerTxUrl(txSig)} target="_blank" rel="noreferrer" className="underline">
            View transaction
          </a>
        </p>
      ) : null}

      {!hideActions ? (
        <div className="wallet-funding-withdraw__actions">
          <button type="button" className="secondary-button w-full" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="primary-button w-full" disabled={!canSubmit}>
            {pending ? "Sending…" : "Withdraw"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
