"use client";

import { useEffect, useRef, useState } from "react";
import { completePumpSignIn } from "@/lib/aa/pump-account";
import { PumpIcon, faShieldCheck } from "@/lib/icons";

type OAuthAuthCompleteClientProps = {
  status: string | null;
  message: string | null;
  provider: string | null;
};

export function OAuthAuthCompleteClient({
  status,
  message: errorMessage,
  provider,
}: OAuthAuthCompleteClientProps) {
  const handledRef = useRef(false);
  const [message, setMessage] = useState("Completing sign-in…");
  const [failed, setFailed] = useState(false);
  const providerLabel = provider ?? "account";

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    if (status !== "ok") {
      setFailed(true);
      setMessage(errorMessage ?? "Sign-in could not be completed.");
      return;
    }

    void (async () => {
      try {
        await completePumpSignIn();
        window.location.replace("/");
      } catch (error) {
        setFailed(true);
        setMessage(
          error instanceof Error
            ? error.message
            : `Could not restore your ${providerLabel} session.`
        );
      }
    })();
  }, [status, errorMessage, providerLabel]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="modal-panel w-full max-w-[420px] px-6 py-8 text-center sm:px-8">
        <div
          className={`mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border ${
            failed
              ? "border-pump-danger/35 bg-pump-danger/8"
              : "border-pump-border/35 bg-pump-border/6"
          }`}
        >
          <PumpIcon
            icon={faShieldCheck}
            className={`h-6 w-6 ${failed ? "text-pump-danger" : "text-pump-accent"}`}
          />
        </div>
        <h1 className="text-h2 font-semibold tracking-tight text-pump-text">
          {failed ? "Sign-in failed" : "Signing you in"}
        </h1>
        <p className="mt-2 text-body-sm leading-relaxed text-pump-muted" role="status" aria-live="polite">
          {message}
        </p>
        {failed ? (
          <a
            href="/"
            className="primary-button mt-6 inline-flex min-h-[2.75rem] items-center justify-center px-5 text-body-sm"
          >
            Return to Pump
          </a>
        ) : null}
      </div>
    </main>
  );
}
