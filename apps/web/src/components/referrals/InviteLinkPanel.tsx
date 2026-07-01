"use client";

import { useCallback, useState } from "react";
import { NATIVE_SYMBOL, shortAddress } from "@/config/chain";
import { useUserAvatar } from "@/components/user/UserAvatarProvider";
import { formatUsdReadable } from "@/lib/format-usd";
import { bnbToUsd } from "@/lib/format-usd";

type InviteLinkPanelProps = {
  address: string;
  inviteCount: number;
  referralVolumeBnb: number;
  bnbUsd: number | null;
};

function formatVolumeBnb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.0001) return value.toFixed(6);
  return value.toFixed(8);
}

export function InviteLinkPanel({
  address,
  inviteCount,
  referralVolumeBnb,
  bnbUsd,
}: InviteLinkPanelProps) {
  const { displayUsername } = useUserAvatar();
  const [copied, setCopied] = useState(false);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${address}`
      : `/?ref=${address}`;

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [inviteUrl]);

  const volumeUsd = bnbToUsd(referralVolumeBnb, bnbUsd);

  return (
    <div className="mt-2 rounded-md border border-pump-border/15 bg-pump-surface/25 p-2.5">
      <p className="section-label">Your invite link</p>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 truncate font-mono text-caption text-pump-muted">{inviteUrl}</p>
        <button type="button" onClick={() => void copyLink()} className="chip-button shrink-0">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="mt-2 text-caption text-pump-muted">
        {inviteCount} invite{inviteCount === 1 ? "" : "s"} ·{" "}
        {formatUsdReadable(volumeUsd, { compact: true })} ref volume (
        {formatVolumeBnb(referralVolumeBnb)} {NATIVE_SYMBOL})
      </p>
      <p className="mt-0.5 text-caption text-pump-muted">
        Share with {displayUsername ?? shortAddress(address)} as referrer — friends must link before their first trade.
      </p>
    </div>
  );
}
