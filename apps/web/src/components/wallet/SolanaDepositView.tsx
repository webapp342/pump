"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { NATIVE_SYMBOL, shortSolanaAddress } from "@/config/solana";
import { SOLANA_FUNDING_CHAIN_LABEL } from "@/config/solana-explorer";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import {
  hydrateSolanaSilentSession,
  type SolanaSilentSession,
} from "@/lib/solana/silent-session";
import { PumpIcon, faCheck, faCopy } from "@/lib/icons";

export function SolanaDepositView() {
  const [wallet, setWallet] = useState<SolanaSilentSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const w = await hydrateSolanaSilentSession();
        if (!cancelled) setWallet(w);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load deposit address");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wallet?.address) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(wallet.address, { margin: 1, width: 220 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [wallet?.address]);

  async function onCopy() {
    if (!wallet?.address) return;
    const ok = await copyToClipboard(wallet.address);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <p className="wallet-funding-sheet__notice">Loading Solana deposit address…</p>;
  }
  if (error || !wallet) {
    return (
      <p className="wallet-funding-sheet__notice notice-warning">
        {error ?? "Sign in to view your deposit address."}
      </p>
    );
  }

  return (
    <div className="wallet-funding-deposit">
      <p className="wallet-funding-deposit__hint">
        Send {NATIVE_SYMBOL} to this address on {SOLANA_FUNDING_CHAIN_LABEL}. You pay network fees when
        you trade or withdraw.
      </p>

      <div className="wallet-funding-deposit__qr">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Solana deposit address QR" className="wallet-funding-deposit__qr-img" />
        ) : (
          <div className="wallet-funding-deposit__qr-placeholder">Generating QR…</div>
        )}
      </div>

      <div className="wallet-funding-deposit__address">
        <span className="financial-value wallet-funding-deposit__address-text">
          {shortSolanaAddress(wallet.address)}
        </span>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="wallet-funding-deposit__copy"
          aria-label={copied ? "Address copied" : "Copy deposit address"}
        >
          <PumpIcon icon={copied ? faCheck : faCopy} className="h-3.5 w-3.5 shrink-0" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
