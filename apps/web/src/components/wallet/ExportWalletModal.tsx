"use client";

import { useEffect, useRef, useState } from "react";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { fetchWalletPrivateKey } from "@/lib/aa/pump-account";
import { PumpIcon, faCopy } from "@/lib/icons";

type ExportWalletModalProps = {
  open: boolean;
  onClose: () => void;
};

function maskPrivateKey(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 6)}••••••••••••••••${key.slice(-4)}`;
}

export function ExportWalletModal({ open, onClose }: ExportWalletModalProps) {
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoCopiedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPrivateKey(null);
      setLoading(false);
      setError(null);
      setRevealed(false);
      setCopied(false);
      autoCopiedRef.current = false;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchWalletPrivateKey()
      .then((key) => {
        if (!cancelled) {
          setPrivateKey(key);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load wallet key.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !privateKey || autoCopiedRef.current) return;
    autoCopiedRef.current = true;
    void copyToClipboard(privateKey).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    });
  }, [open, privateKey]);

  async function onCopyKey() {
    if (!privateKey) return;
    const ok = await copyToClipboard(privateKey);
    setCopied(ok);
    if (ok) {
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!open) return null;

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Export wallet"
      title="Export wallet"
      zIndex={130}
      panelClassName="wallet-export-modal max-w-md"
    >
            <p className="notice-warning mt-3 text-body-sm leading-snug">
              Never share your private key. Anyone with this key can control your smart wallet and
              withdraw your funds.
            </p>

            {copied ? (
              <p className="mt-3 text-body-sm font-medium text-pump-success">Private key copied to clipboard.</p>
            ) : null}

            {loading ? (
              <p className="mt-4 text-body-sm text-pump-muted">Loading wallet key…</p>
            ) : error ? (
              <p className="notice-warning mt-4 leading-snug">{error}</p>
            ) : privateKey ? (
              <div className="mt-4 space-y-3">
                <div className="wallet-export-modal__key panel-surface">
                  <p className="section-label text-pump-muted">Private key</p>
                  <p className="wallet-export-modal__key-value financial-value">
                    {revealed ? privateKey : maskPrivateKey(privateKey)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRevealed((value) => !value)}
                    className="secondary-button py-2.5 text-body-sm"
                  >
                    {revealed ? "Hide" : "Reveal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onCopyKey()}
                    className="primary-button inline-flex items-center justify-center py-2.5 text-body-sm"
                  >
                    <PumpIcon icon={faCopy} className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                    {copied ? "Copied" : "Copy key"}
                  </button>
                </div>
              </div>
            ) : null}

            <button type="button" onClick={onClose} className="secondary-button mt-4 w-full py-2.5 text-body-sm">
              Close
            </button>
    </AppBottomSheet>
  );
}
