"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { pumpChain, shortAddress } from "@/config/chain";
import {
  captureReferrerFromUrl,
  readStoredReferrer,
  REFERRAL_DISMISS_STORAGE_KEY,
} from "@/lib/referral-storage";

export function ReferralCaptureProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chain } = useAccount();
  const [storedReferrer, setStoredReferrer] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const capturedRef = useRef(false);

  useEffect(() => {
    if (capturedRef.current) return;
    capturedRef.current = true;
    captureReferrerFromUrl();
    setStoredReferrer(readStoredReferrer());
    try {
      setDismissed(sessionStorage.getItem(REFERRAL_DISMISS_STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(REFERRAL_DISMISS_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const selfRef =
    storedReferrer && address && storedReferrer === address.toLowerCase();

  const showBanner =
    isConnected &&
    Boolean(address) &&
    !dismissed &&
    Boolean(storedReferrer) &&
    !selfRef &&
    chain?.id === pumpChain.id;

  return (
    <>
      {showBanner ? (
        <div className="border-b border-pump-accent/25 bg-pump-accent/10 px-4 py-2.5">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-sm text-pump-text">
              Invited by{" "}
              <span className="font-mono text-pump-accent">{shortAddress(storedReferrer!)}</span>
              {" — "}
              your first trade will automatically link you for referral rewards. No extra signature.
            </p>
            <button
              type="button"
              onClick={dismissBanner}
              className="secondary-button shrink-0 px-3 py-1.5 text-caption"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}
