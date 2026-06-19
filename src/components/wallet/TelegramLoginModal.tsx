"use client";

import { useEffect, useRef, useState } from "react";
import {
  createTelegramKernelSessionFromWidget,
  type TelegramAccountSession,
} from "@/lib/aa/telegram-account";
import { telegramBotUsername } from "@/lib/telegram-config";
import type { TelegramLoginPayload } from "@/lib/telegram/verify-login";
import { formatTradeError } from "@/lib/trade-errors";
import { ModalPortal } from "@/components/ui/ModalPortal";

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginPayload) => void;
  }
}

type TelegramLoginModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (session: TelegramAccountSession) => void;
};

export function TelegramLoginModal({ open, onClose, onSuccess }: TelegramLoginModalProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const onSuccessRef = useRef(onSuccess);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (!open || !widgetRef.current || !telegramBotUsername) return;

    setError(null);
    setPending(false);
    widgetRef.current.innerHTML = "";

    window.onTelegramAuth = (user) => {
      void (async () => {
        setPending(true);
        setError(null);
        try {
          const session = await createTelegramKernelSessionFromWidget(user);
          onSuccessRef.current(session);
        } catch (err) {
          setError(formatTradeError(err));
        } finally {
          setPending(false);
        }
      })();
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBotUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    widgetRef.current.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
    };
  }, [open]);

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
          className="modal-sheet-host z-[111]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="telegram-login-title"
        >
          <div className="modal-panel modal-sheet-panel max-w-md rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:border-x sm:border-b sm:p-5">
            <div className="flex items-start justify-between gap-3 border-b border-pump-border/45 pb-3">
              <div className="min-w-0">
                <h2 id="telegram-login-title" className="text-h3 font-semibold text-pump-text">
                  Sign in with Telegram
                </h2>
                <p className="mt-0.5 text-caption text-pump-muted">
                  Connect your Telegram account to open your Pump smart wallet on this device.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pump-muted transition hover:bg-pump-border/10 hover:text-pump-text"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex min-h-[52px] items-center justify-center rounded-lg border border-pump-border/45 bg-pump-border/4 px-3 py-4">
                {telegramBotUsername ? (
                  <div ref={widgetRef} className="flex justify-center" />
                ) : (
                  <p className="text-caption text-pump-muted">
                    Set <code className="font-mono">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code> in{" "}
                    <code className="font-mono">.env</code>.
                  </p>
                )}
              </div>

              <p className="text-caption text-pump-muted">
                Your smart wallet is tied to your Telegram account and restored via a secure session
                cookie. Fund the smart wallet with BNB for gas.
              </p>

              {pending ? (
                <p className="text-caption text-pump-muted">Opening wallet…</p>
              ) : null}

              {error ? <p className="notice-warning leading-snug">{error}</p> : null}
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}
