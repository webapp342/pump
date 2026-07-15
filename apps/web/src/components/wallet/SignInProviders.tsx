"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AppleBrandIcon,
  GoogleBrandIcon,
  TelegramBrandIcon,
} from "@/components/icons/BrandIcons";
import {
  isAppleAuthConfigured,
  isGoogleAuthConfigured,
  isTelegramAuthConfigured,
} from "@/lib/auth-config";
import { safeReturnPath } from "@/lib/safe-return-path";
import { PumpIcon, faShieldCheck } from "@/lib/icons";
import { formatTradeError } from "@/lib/trade-errors";

type ProviderConfig = {
  redirectReady?: boolean;
};

type SignInProvidersProps = {
  /** When false, skips provider config fetches (modal closed). */
  active?: boolean;
  /** Safe relative path to return to after OIDC complete. */
  returnPath?: string | null;
  onBeforeRedirect?: () => void;
  className?: string;
};

function withNextParam(path: string, returnPath: string | null): string {
  if (!returnPath) return path;
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("next", returnPath);
  return `${url.pathname}${url.search}`;
}

export function SignInProviders({
  active = true,
  returnPath = null,
  onBeforeRedirect,
  className,
}: SignInProvidersProps) {
  const [telegramReady, setTelegramReady] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [guestAuthEnabled, setGuestAuthEnabled] = useState(false);
  const [pending, setPending] = useState<"telegram" | "google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showTelegram = isTelegramAuthConfigured();
  const [googleVisible, setGoogleVisible] = useState(isGoogleAuthConfigured());
  const [appleVisible, setAppleVisible] = useState(isAppleAuthConfigured());
  const showGoogle = googleVisible;
  const showApple = appleVisible;
  const safeNext = safeReturnPath(returnPath);

  useEffect(() => {
    if (!active) return;
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

    void fetch("/api/auth/guest/config", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: { enabled?: boolean } };
        setGuestAuthEnabled(Boolean(response.ok && body.data?.enabled));
      })
      .catch(() => setGuestAuthEnabled(false));
  }, [active, showTelegram]);

  const startProvider = useCallback(
    async (provider: "telegram" | "google" | "apple") => {
      setPending(provider);
      setError(null);
      try {
        const path =
          provider === "telegram"
            ? "/api/auth/telegram/start"
            : provider === "google"
              ? "/api/auth/google/start"
              : "/api/auth/apple/start";
        const response = await fetch(withNextParam(path, safeNext), { cache: "no-store" });
        const body = (await response.json()) as { data?: { authUrl?: string }; error?: string };
        if (!response.ok || !body.data?.authUrl) {
          throw new Error(body.error ?? "Could not start sign-in.");
        }
        onBeforeRedirect?.();
        window.location.assign(body.data.authUrl);
      } catch (err) {
        setError(formatTradeError(err));
        setPending(null);
      }
    },
    [onBeforeRedirect, safeNext]
  );

  return (
    <div className={className ?? "sign-in-modal__providers"}>
      {showGoogle ? (
        <button
          type="button"
          className="sign-in-modal__btn"
          disabled={Boolean(pending) || !googleReady}
          onClick={() => void startProvider("google")}
        >
          <GoogleBrandIcon />
          {pending === "google" ? "Redirecting…" : "Sign in with Google"}
        </button>
      ) : null}

      {showTelegram ? (
        <button
          type="button"
          className="sign-in-modal__btn"
          disabled={Boolean(pending) || !telegramReady}
          onClick={() => void startProvider("telegram")}
        >
          <TelegramBrandIcon />
          {pending === "telegram" ? "Redirecting…" : "Sign in with Telegram"}
        </button>
      ) : null}

      {showApple ? (
        <button
          type="button"
          className="sign-in-modal__btn"
          disabled={Boolean(pending) || !appleReady}
          onClick={() => void startProvider("apple")}
        >
          <AppleBrandIcon />
          {pending === "apple" ? "Redirecting…" : "Sign in with Apple"}
        </button>
      ) : null}

      {guestAuthEnabled ? (
        <button
          type="button"
          className="sign-in-modal__btn"
          disabled={Boolean(pending)}
          onClick={() => {
            setPending("telegram");
            onBeforeRedirect?.();
            window.location.assign(withNextParam("/api/auth/guest", safeNext));
          }}
        >
          <span className="sign-in-modal__btn-icon" aria-hidden>
            <PumpIcon icon={faShieldCheck} className="h-4 w-4" />
          </span>
          Sign in as Guest
        </button>
      ) : null}

      {error ? (
        <p role="alert" aria-live="polite" className="sign-in-modal__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
