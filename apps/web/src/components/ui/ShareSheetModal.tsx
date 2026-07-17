"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  LinkedInBrandIcon,
  TelegramBrandIcon,
  WhatsAppBrandIcon,
  XBrandIcon,
} from "@/components/icons/BrandIcons";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { PumpIcon, faCheck, faCopy, faMail, faShare } from "@/lib/icons";
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
  footnote?: ReactNode;
};

function ShareChannelIcon({ channel }: { channel: ShareChannel }) {
  switch (channel.id) {
    case "x":
      return <XBrandIcon className="h-4 w-4" />;
    case "telegram":
      return <TelegramBrandIcon className="h-4 w-4" />;
    case "whatsapp":
      return <WhatsAppBrandIcon className="h-4 w-4" />;
    case "email":
      return <PumpIcon icon={faMail} className="h-4 w-4" />;
    case "linkedin":
      return <LinkedInBrandIcon className="h-4 w-4" />;
    case "native":
      return <PumpIcon icon={faShare} className="h-4 w-4" />;
  }
}

export function ShareSheetModal({
  open,
  onClose,
  payload,
  title = "Share",
  description,
  footnote,
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
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={title}
      title={title}
      subtitle={description}
      zIndex={60}
      panelClassName="max-w-md"
    >
          <div className="share-sheet-copy">
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
                  <PumpIcon icon={faCheck} className="h-4 w-4 text-pump-success" />
                ) : (
                  <PumpIcon icon={faCopy} className="h-4 w-4" />
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

          {footnote ? <div className="share-sheet-footnote mt-4">{footnote}</div> : null}
    </AppBottomSheet>
  );
}
