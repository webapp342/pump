"use client";

import { useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";

export function SessionGrantModal() {
  const {
    sessionGrantOpen,
    sessionGrantLoading,
    sessionGrantError,
    grantSession,
    closeSessionGrant,
  } = usePumpWallet();
  const [remember, setRemember] = useState(true);

  if (!sessionGrantOpen) return null;

  async function onGrant() {
    try {
      await grantSession(remember);
    } catch {
      // Error surfaced via sessionGrantError
    }
  }

  return (
    <ModalPortal open={sessionGrantOpen}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[120] cursor-default"
          aria-label="Close"
          onClick={closeSessionGrant}
        />
        <div
          className="modal-sheet-host z-[121]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-grant-title"
        >
          <div className="modal-panel modal-sheet-panel max-w-md rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:border-x sm:border-b sm:p-5">
            <h2 id="session-grant-title" className="text-h3 font-semibold text-pump-text">
              Fast trading on Pump
            </h2>
            <p className="mt-1 text-caption text-pump-muted">
              Allow one-time permission so buys, sells, and launches run in-app without wallet
              popups. You may be asked to confirm with Face ID or your device passcode — not
              MetaMask.
            </p>

            <label className="mt-4 flex cursor-pointer items-start gap-3 border border-pump-border/45 bg-pump-border/4 p-3">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-body-sm text-pump-text">
                <span className="font-semibold">Don&apos;t ask again</span>
                <span className="mt-0.5 block text-caption text-pump-muted">
                  7 days · trade &amp; create · max ~0.05 BNB/day gas (sponsored)
                </span>
              </span>
            </label>

            {sessionGrantError ? (
              <p className="notice-warning mt-3 leading-snug">{sessionGrantError}</p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeSessionGrant}
                className="secondary-button w-full"
                disabled={sessionGrantLoading}
              >
                Ask each time
              </button>
              <button
                type="button"
                onClick={() => void onGrant()}
                className="primary-button w-full"
                disabled={sessionGrantLoading}
              >
                {sessionGrantLoading ? "Confirming…" : "Allow"}
              </button>
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}
