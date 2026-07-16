"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { NATIVE_SYMBOL } from "@/config/chain";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatUsd } from "@/lib/format-usd";

function formatCompactNative(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K ${NATIVE_SYMBOL}`;
  if (value >= 1) return `${value.toFixed(2)} ${NATIVE_SYMBOL}`;
  if (value > 0) return `${value.toFixed(4)} ${NATIVE_SYMBOL}`;
  return `0 ${NATIVE_SYMBOL}`;
}

function creatorLabel(token: TokenListItem): React.ReactNode {
  if (token.creatorDisplayUsername) return token.creatorDisplayUsername;
  if (token.creatorUsername) return token.creatorUsername;
  return <UserDisplayName address={token.creatorAddress} compact />;
}

export function KingCard({ token }: { token: TokenListItem }) {
  const router = useRouter();
  const href = `/token/${token.address}`;
  const { bnbUsd } = useBnbUsdPrice();
  const marketCapBnb = Number(token.marketCapBnb);
  const marketCapUsd = bnbToUsd(marketCapBnb, bnbUsd);

  return (
    <Link
      href={href}
      prefetch={true}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      className="block rounded-lg border border-pump-accent/25 bg-gradient-to-br from-pump-accent/12 via-pump-card/88 to-pump-surface/68 p-5 shadow-panel transition hover:border-pump-accent/45"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="page-kicker">Featured token</p>
          <div className="mt-3 flex min-w-0 items-center gap-3">
            <TokenAvatar
              address={token.address}
              symbol={token.symbol}
              logoUrl={token.logoUrl}
              size="row"
            />
            <div className="min-w-0">
              <p className="truncate text-h1 font-semibold text-pump-text">
                {token.symbol}
              </p>
              <p className="truncate text-sm text-pump-muted">{token.name}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:min-w-[360px]">
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/38 p-3">
            <p className="text-[11px] uppercase tracking-wide text-pump-muted">Market cap</p>
            <p className="financial-value mt-1 text-lg font-semibold text-pump-text">
              {marketCapUsd != null ? (formatUsd(marketCapUsd, { compact: true }) ?? "—") : "—"}
            </p>
            <p className="mt-1 text-xs text-pump-muted">{formatCompactNative(marketCapBnb)}</p>
          </div>
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/38 p-3">
            <p className="text-[11px] uppercase tracking-wide text-pump-muted">Holders</p>
            <p className="financial-value mt-1 text-lg font-semibold text-pump-text">
              {token.holderCount}
            </p>
            <p className="mt-1 text-xs text-pump-muted">Tracked wallets</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-pump-border/10 pt-3 text-xs">
        <span className="truncate text-pump-muted">Creator {creatorLabel(token)}</span>
        <span className="font-medium text-pump-accent">Open token</span>
      </div>
    </Link>
  );
}
