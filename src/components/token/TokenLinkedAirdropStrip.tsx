"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isPromotableAirdropStatus } from "@/lib/airdrop-status";
import type { TokenAirdropPromo } from "@/lib/db/airdrops";
import { AirdropPromoIcon } from "@/components/ui/AirdropGiftIcon";

type TokenAirdropLinkChipProps = {
  tokenAddress: string;
  className?: string;
};

/** Compact header chip — links to the token's open airdrop campaign. */
export function TokenAirdropLinkChip({ tokenAddress, className = "" }: TokenAirdropLinkChipProps) {
  const [campaign, setCampaign] = useState<TokenAirdropPromo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/tokens/${tokenAddress.toLowerCase()}/airdrops`, {
          cache: "no-store",
        });
        const body = (await response.json()) as { data?: TokenAirdropPromo | null };
        if (!cancelled && response.ok) {
          const next = body.data ?? null;
          setCampaign(next && isPromotableAirdropStatus(next.displayStatus) ? next : null);
        }
      } catch {
        if (!cancelled) setCampaign(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  if (!loaded || !campaign) {
    return null;
  }

  return (
    <Link
      href={`/airdrops/${campaign.id}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm border border-pump-border/35 bg-pump-surface/55 px-1.5 py-0.5 text-label font-medium text-pump-accent transition-colors hover:border-pump-accent/30 hover:bg-pump-accent/8 ${className}`}
      aria-label="View airdrop campaign"
    >
      <AirdropPromoIcon size={10} />
      <span>Airdrop</span>
    </Link>
  );
}

/** @deprecated Use TokenAirdropLinkChip */
export const TokenLinkedAirdropStrip = TokenAirdropLinkChip;
