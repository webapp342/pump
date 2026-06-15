"use client";

import { Check, Copy, Mail, Share2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { ICON_STROKE } from "@/lib/icons";
import {
  copyShareUrl,
  getShareChannels,
  type ShareChannel,
  type SharePayload,
} from "@/lib/share-links";
import { truncateReferralInviteUrl } from "@/lib/referral-link";

type ShareSheetModalProps = {
  open: boolean;
  onClose: () => void;
  payload: SharePayload;
  title?: string;
  description?: string;
};

function XShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
      <path d="M13.2 10.5 19.4 3h-1.5l-5.4 6.5L8.1 3H3.2l6.5 9.4L3.2 21h1.5l5.7-6.9 5.1 6.9h4.9l-6.8-9.5Z" />
    </svg>
  );
}

function TelegramShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-none stroke-current">
      <path
        d="M20.5 4.5 4.8 11.1c-.9.4-.9 1.6.1 1.9l4 1.2 1.5 4.7c.3.9 1.5.9 1.8 0l1.7-5.9 5.3-7.5c.5-.7-.1-1.6-.9-1.2Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.8 13.2 15.8 8.5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WhatsAppShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
      <path d="M12 2a10 10 0 0 0-8.7 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.1 1.1-1.8 1.2-.5.1-1.1.2-3.6-.8-3-1.2-4.9-4.1-5.1-4.3-.2-.2-1.2-1.6-1.2-3.1s.8-2.2 1.1-2.5c.3-.3.7-.4.9-.4h.7c.2 0 .5-.1.8.6l1.1 2.7c.1.2.1.5 0 .7-.1.2-.2.3-.4.5l-.6.6c-.2.2-.3.4-.2.7.2.5 1 1.6 2.2 2.5 1.5 1.1 2.8 1.4 3.2 1.6.4.2.7.1.9-.1l1.2-1.4c.2-.3.5-.2.8-.1l2.2 1c.6.3.6.6.5.9Z" />
    </svg>
  );
}

function LinkedInShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
      <path d="M6.5 8.5h3v11h-3v-11ZM8 4.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5ZM12.5 8.5h2.9v1.5h.1c.4-.8 1.4-1.7 2.9-1.7 3.1 0 3.7 2 3.7 4.7v6.5h-3v-5.8c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1v5.9h-3v-11Z" />
    </svg>
  );
}

function ShareChannelIcon({ channel }: { channel: ShareChannel }) {
  switch (channel.id) {
    case "x":
      return <XShareIcon />;
    case "telegram":
      return <TelegramShareIcon />;
    case "whatsapp":
      return <WhatsAppShareIcon />;
    case "email":
      return <Mail className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />;
    case "linkedin":
      return <LinkedInShareIcon />;
    case "native":
      return <Share2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />;
  }
}

export function ShareSheetModal({
  open,
  onClose,
  payload,
  title = "Share",
  description,
}: ShareSheetModalProps) {
  const [copied, setCopied] = useState(false);
  const [nativePending, setNativePending] = useState(false);
  const channels = getShareChannels(payload);
  const urlPreview = truncateReferralInviteUrl(payload.url);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setNativePending(false);
    }
  }, [open]);

  const copyLink = useCallback(async () => {
    const ok = await copyShareUrl(payload.url);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }, [payload.url]);

  const openNativeShare = useCallback(async () => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    setNativePending(true);
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      onClose();
    } catch {
      // user cancelled or share failed
    } finally {
      setNativePending(false);
    }
  }, [onClose, payload]);

  if (!open) return null;

  return (
    <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-[60]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="modal-panel relative w-full max-w-md p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 border-b border-pump-border/45 pb-3">
            <div className="min-w-0">
              <h2 id="share-sheet-title" className="text-h3 font-semibold text-pump-text">
                {title}
              </h2>
              {description ? (
                <p className="mt-0.5 text-caption text-pump-muted">{description}</p>
              ) : null}
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

          <div className="share-sheet-copy mt-4">
            <p className="section-label">Link</p>
            <div className="share-sheet-copy-row mt-1.5">
              <p className="share-sheet-copy-url" title={payload.url}>
                {urlPreview}
              </p>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="share-sheet-copy-button"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-pump-success" strokeWidth={2.25} aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                )}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          <div className="mt-4">
            <p className="section-label">Share via</p>
            <div className="share-sheet-grid mt-2">
              {channels.map((channel) =>
                channel.native ? (
                  <button
                    key={channel.id}
                    type="button"
                    disabled={nativePending}
                    onClick={() => void openNativeShare()}
                    className="share-sheet-option"
                  >
                    <span className="share-sheet-option-icon" aria-hidden>
                      <ShareChannelIcon channel={channel} />
                    </span>
                    <span className="share-sheet-option-label">{channel.label}</span>
                  </button>
                ) : (
                  <a
                    key={channel.id}
                    href={channel.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="share-sheet-option"
                    onClick={onClose}
                  >
                    <span className="share-sheet-option-icon" aria-hidden>
                      <ShareChannelIcon channel={channel} />
                    </span>
                    <span className="share-sheet-option-label">{channel.label}</span>
                  </a>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
