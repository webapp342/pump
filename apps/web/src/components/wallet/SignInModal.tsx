"use client";

import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  isAppleAuthConfigured,
  isGoogleAuthConfigured,
  isTelegramAuthConfigured,
} from "@/lib/auth-config";
import { ICON_STROKE } from "@/lib/icons";
import { formatTradeError } from "@/lib/trade-errors";

type SignInModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type ProviderConfig = {
  redirectReady?: boolean;
};

function TelegramBrandIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9.417 15.181l-.397 5.584c.568 0 .814-.244 1.109-.537l2.663-2.545 5.518 4.041c1.012.558 1.725.264 1.998-.929L23.93 3.821c.321-1.496-.541-2.081-1.527-1.732L1.293 9.738c-1.453.558-1.435 1.357-.248 1.715l5.918 1.846L18.916 5.87c.684-.451 1.307-.201.794.315" />
    </svg>
  );
}

function GoogleBrandIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleBrandIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.46 2.22-1.27 3.03-.81.8-2.01 1.32-3.14 1.24-.05-1.09.48-2.24 1.24-3.03.87-.86 2.28-1.49 3.17-1.24zM20.88 17.14c-.57 1.3-.85 1.88-1.58 3.03-1.02 1.57-2.46 3.53-4.25 3.54-1.59.01-2-.98-3.73-.98-1.73 0-2.21.97-3.74.99-1.78.03-3.15-1.66-4.17-3.22-2.28-3.48-2.53-7.56-1.12-9.72 1-1.53 2.58-2.43 4.07-2.43 1.9 0 3.09 1.16 4.66 1.16 1.52 0 2.44-1.16 4.61-1.16 1.65.03 3.4 1.12 4.4 2.88-3.87 2.1-3.24 7.58.62 9.15z" />
    </svg>
  );
}

const providerButtonClass =
  "flex w-full min-h-[3rem] items-center justify-center gap-3 rounded-lg border border-pump-border/55 bg-pump-card-soft px-4 text-body-sm font-semibold text-pump-text transition hover:border-pump-border hover:bg-pump-border/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pump-accent disabled:cursor-not-allowed disabled:opacity-50";

export function SignInModal({ open, onClose, onSuccess }: SignInModalProps) {
  const onSuccessRef = useRef(onSuccess);
  const [telegramReady, setTelegramReady] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [pending, setPending] = useState<"telegram" | "google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showTelegram = isTelegramAuthConfigured();
  const [googleVisible, setGoogleVisible] = useState(isGoogleAuthConfigured());
  const [appleVisible, setAppleVisible] = useState(isAppleAuthConfigured());
  const showGoogle = googleVisible;
  const showApple = appleVisible;

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPending(null);

    if (showTelegram) {
      void fetch("/api/auth/telegram/config", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as {
            data?: { clientId?: string; redirectReady?: boolean };
          };
          setTelegramReady(Boolean(response.ok && body.data?.clientId && body.data.redirectReady));
        })
        .catch(() => setTelegramReady(false));
    }

    void fetch("/api/auth/google/config", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: ProviderConfig };
        if (response.ok) {
          setGoogleVisible(true);
          setGoogleReady(Boolean(body.data?.redirectReady));
          return;
        }
        setGoogleVisible(isGoogleAuthConfigured());
        setGoogleReady(false);
      })
      .catch(() => {
        setGoogleVisible(isGoogleAuthConfigured());
        setGoogleReady(false);
      });

    void fetch("/api/auth/apple/config", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: ProviderConfig };
        if (response.ok) {
          setAppleVisible(true);
          setAppleReady(Boolean(body.data?.redirectReady));
          return;
        }
        setAppleVisible(isAppleAuthConfigured());
        setAppleReady(false);
      })
      .catch(() => {
        setAppleVisible(isAppleAuthConfigured());
        setAppleReady(false);
      });
  }, [open, showTelegram]);

  const startProvider = useCallback(async (provider: "telegram" | "google" | "apple") => {
    setPending(provider);
    setError(null);
    try {
      const path =
        provider === "telegram"
          ? "/api/auth/telegram/start"
          : provider === "google"
            ? "/api/auth/google/start"
            : "/api/auth/apple/start";
      const response = await fetch(path, { cache: "no-store" });
      const body = (await response.json()) as { data?: { authUrl?: string }; error?: string };
      if (!response.ok || !body.data?.authUrl) {
        throw new Error(body.error ?? "Could not start sign-in.");
      }
      onSuccessRef.current();
      window.location.assign(body.data.authUrl);
    } catch (err) {
      setError(formatTradeError(err));
      setPending(null);
    }
  }, []);

  if (!open) return null;

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[110] cursor-default transition-opacity"
          aria-label="Close"
          onClick={onClose}
        />
        <div
          className="modal-backdrop-shell fixed inset-0 z-[111] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-in-title"
        >
          <div className="modal-panel pointer-events-auto w-full max-w-[420px] overflow-hidden shadow-xl shadow-black/20">
            <div className="relative px-6 pt-8 pb-2 sm:px-8">
              <button
                type="button"
                onClick={onClose}
                disabled={Boolean(pending)}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text disabled:opacity-40"
                aria-label="Close"
              >
                <span className="text-xl leading-none" aria-hidden>
                  ×
                </span>
              </button>

              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-pump-border/35 bg-pump-border/6">
                <ShieldCheck className="h-6 w-6 text-pump-accent" strokeWidth={ICON_STROKE} aria-hidden />
              </div>

              <div className="text-center">
                <h2 id="sign-in-title" className="text-h2 font-semibold tracking-tight text-pump-text">
                  Sign in
                </h2>
                <p className="mx-auto mt-2 max-w-[18rem] text-body-sm leading-relaxed text-pump-muted sm:max-w-none">
                  Connect your account to access your smart wallet on BSC Testnet.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-pump-border/30 px-6 py-6 sm:px-8">
              {showTelegram ? (
                <button
                  type="button"
                  className={providerButtonClass}
                  disabled={Boolean(pending) || !telegramReady}
                  onClick={() => void startProvider("telegram")}
                >
                  <TelegramBrandIcon />
                  {pending === "telegram" ? "Redirecting…" : "Continue with Telegram"}
                </button>
              ) : null}

              {showGoogle ? (
                <button
                  type="button"
                  className={providerButtonClass}
                  disabled={Boolean(pending) || !googleReady}
                  onClick={() => void startProvider("google")}
                >
                  <GoogleBrandIcon />
                  {pending === "google" ? "Redirecting…" : "Continue with Google"}
                </button>
              ) : null}

              {showApple ? (
                <button
                  type="button"
                  className={providerButtonClass}
                  disabled={Boolean(pending) || !appleReady}
                  onClick={() => void startProvider("apple")}
                >
                  <AppleBrandIcon />
                  {pending === "apple" ? "Redirecting…" : "Continue with Apple"}
                </button>
              ) : null}

              {error ? (
                <p role="alert" aria-live="polite" className="notice-warning text-left leading-snug">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}

/** @deprecated use SignInModal */
export const TelegramLoginModal = SignInModal;
