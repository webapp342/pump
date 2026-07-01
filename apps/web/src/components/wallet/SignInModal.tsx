"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppleBrandIcon,
  GoogleBrandIcon,
  TelegramBrandIcon,
} from "@/components/icons/BrandIcons";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  isAppleAuthConfigured,
  isGoogleAuthConfigured,
  isTelegramAuthConfigured,
} from "@/lib/auth-config";
import { PumpIcon, faShieldCheck } from "@/lib/icons";
import { formatTradeError } from "@/lib/trade-errors";

type SignInModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type ProviderConfig = {
  redirectReady?: boolean;
};

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
                <PumpIcon icon={faShieldCheck} className="h-6 w-6 text-pump-accent" />
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

              {process.env.NODE_ENV === "development" ? (
                <button
                  type="button"
                  className={providerButtonClass}
                  disabled={Boolean(pending)}
                  onClick={() => {
                    setPending("telegram"); // just to show loading state
                    window.location.assign("/api/auth/guest");
                  }}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-pump-border/20 text-pump-text">
                    <PumpIcon icon={faShieldCheck} className="h-3 w-3" />
                  </div>
                  Continue as Guest (Local)
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
