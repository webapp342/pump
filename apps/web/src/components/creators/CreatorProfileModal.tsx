"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  CreatorProfile,
  CreatorProfileHolding,
  CreatorProfileToken,
} from "@/lib/db/launchpad";
import { explorerAddressUrl } from "@/config/chain";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { useCreatorFollows } from "@/components/creators/CreatorFollowsProvider";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useAccount } from "wagmi";
import {
  DEFAULT_TOKEN_TOTAL_SUPPLY,
  bnbToUsd,
  formatUsdReadable,
} from "@/lib/format-usd";

type CreatorProfileData = CreatorProfile & {
  bnbBalance: string;
  creatorFeesPendingBnb: number;
  creatorFeesTotalBnb: number;
  referralFeesPendingBnb: number;
  referralFeesTotalBnb: number;
};

type CreatorProfileModalProps = {
  open: boolean;
  onClose: () => void;
  creatorAddress: string;
};

function formatTokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  if (value > 0) return value.toFixed(4);
  return "0";
}

function formatSupplyShare(balance: number): string {
  const pct = (balance / DEFAULT_TOKEN_TOTAL_SUPPLY) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  if (pct >= 99.95) return "100%";
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(4)}%`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 p-3">
      <p className="section-label">{label}</p>
      <p className="mt-1 financial-value text-body-sm font-semibold text-pump-text">{value}</p>
      {sub ? <p className="mt-0.5 text-caption text-pump-muted">{sub}</p> : null}
    </div>
  );
}

function CreatedTokenRow({
  token,
  bnbUsd,
}: {
  token: CreatorProfileToken;
  bnbUsd: number | null;
}) {
  const balance = Number(token.creatorTokenBalance);
  const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd);

  return (
    <tr className="border-b border-pump-border/10 last:border-b-0">
      <td className="px-3 py-2.5">
        <Link href={`/token/${token.address}`} className="flex min-w-0 items-center gap-2.5">
          <TokenAvatar
            address={token.address}
            symbol={token.symbol}
            logoUrl={token.logoUrl}
            size={32}
          />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium text-pump-text">{token.name}</p>
            <p className="truncate text-caption text-pump-muted">${token.symbol}</p>
          </div>
        </Link>
      </td>
      <td className="px-3 py-2.5 financial-value text-pump-text">{formatTokenAmount(balance)}</td>
      <td className="px-3 py-2.5 financial-value text-pump-muted">{formatSupplyShare(balance)}</td>
      <td className="px-3 py-2.5 financial-value text-pump-text">
        {formatUsdReadable(mcapUsd, { compact: true })}
      </td>
      <td className="px-3 py-2.5 text-right financial-value text-pump-muted">{token.tradeCount}</td>
    </tr>
  );
}

function buildAllHoldings(profile: CreatorProfile): CreatorProfileHolding[] {
  const fromCreated: CreatorProfileHolding[] = profile.createdTokens
    .filter((token) => Number(token.creatorTokenBalance) > 0)
    .map((token) => ({
      tokenAddress: token.address,
      symbol: token.symbol,
      name: token.name,
      logoUrl: token.logoUrl,
      tokenBalance: token.creatorTokenBalance,
      lastPriceBnb: token.lastPriceBnb,
    }));

  const ownAddresses = new Set(fromCreated.map((holding) => holding.tokenAddress.toLowerCase()));
  const fromOthers = profile.otherHoldings.filter(
    (holding) => !ownAddresses.has(holding.tokenAddress.toLowerCase())
  );

  return [...fromCreated, ...fromOthers].sort((a, b) => {
    const valueA = Number(a.tokenBalance) * Number(a.lastPriceBnb);
    const valueB = Number(b.tokenBalance) * Number(b.lastPriceBnb);
    return valueB - valueA;
  });
}

function HoldingRow({
  holding,
  bnbUsd,
}: {
  holding: CreatorProfileHolding;
  bnbUsd: number | null;
}) {
  const balance = Number(holding.tokenBalance);
  const valueUsd = bnbToUsd(balance * Number(holding.lastPriceBnb), bnbUsd);

  return (
    <tr className="border-b border-pump-border/10 last:border-b-0">
      <td className="px-3 py-2.5">
        <Link
          href={`/token/${holding.tokenAddress}`}
          className="flex min-w-0 items-center gap-2.5"
        >
          <TokenAvatar
            address={holding.tokenAddress}
            symbol={holding.symbol}
            logoUrl={holding.logoUrl}
            size={32}
          />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium text-pump-text">{holding.name}</p>
            <p className="truncate text-caption text-pump-muted">${holding.symbol}</p>
          </div>
        </Link>
      </td>
      <td className="px-3 py-2.5 financial-value text-pump-text">{formatTokenAmount(balance)}</td>
      <td className="px-3 py-2.5 financial-value text-pump-text">
        {formatUsdReadable(valueUsd, { compact: true })}
      </td>
    </tr>
  );
}

export function CreatorProfileModal({ open, onClose, creatorAddress }: CreatorProfileModalProps) {
  const { address } = useAccount();
  const { isFollowing, toggleFollow } = useCreatorFollows();
  const { bnbUsd } = useBnbUsdPrice();
  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !creatorAddress) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/creators/${encodeURIComponent(creatorAddress)}/profile`,
          { cache: "no-store" }
        );
        const body = (await response.json()) as { data?: CreatorProfileData; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.data) {
          throw new Error(body.error ?? "Failed to load creator profile");
        }
        setProfile(body.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load creator profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, creatorAddress]);

  const allHoldings = useMemo(
    () => (profile ? buildAllHoldings(profile) : []),
    [profile]
  );

  if (!open || !mounted) return null;

  const isSelf = address?.toLowerCase() === creatorAddress.toLowerCase();
  const following = isFollowing(creatorAddress);

  return createPortal(
    <>
      <button
        type="button"
        className="modal-backdrop modal-backdrop-dismiss z-[100] cursor-default transition-opacity"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="modal-sheet-host z-[101] sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-profile-title"
      >
        <div className="panel-surface pointer-events-auto relative flex w-full max-w-2xl max-h-[min(90dvh,680px)] flex-col overflow-hidden rounded-t-2xl shadow-panel sm:max-h-[min(72vh,640px)] sm:rounded-xl">
          <div className="shrink-0 border-b border-pump-border/10 px-4 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
            <div className="mb-2 flex justify-center sm:hidden">
              <div className="h-1 w-10 rounded-full bg-pump-border/50" aria-hidden />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <UserAvatarForAddress address={creatorAddress} size={44} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="creator-profile-title"
                      className="financial-value text-h2 font-semibold text-pump-text"
                    >
                      {profile?.displayUsername ?? (
                        <UserDisplayName address={creatorAddress} />
                      )}
                    </h2>
                    <span className="rounded-full bg-pump-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pump-accent">
                      Creator
                    </span>
                  </div>
                  <a
                    href={explorerAddressUrl(creatorAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 text-caption text-pump-muted hover:text-pump-accent hover:underline"
                  >
                    View on BscScan
                  </a>
                </div>
              </div>
              {!isSelf ? (
                <button
                  type="button"
                  onClick={() => toggleFollow(creatorAddress)}
                  className={
                    following
                      ? "secondary-button shrink-0 px-4 py-2 text-body-sm font-semibold"
                      : "shrink-0 rounded-md bg-pump-accent px-4 py-2 text-body-sm font-semibold text-pump-accent-foreground transition hover:opacity-95"
                  }
                >
                  {following ? "Following" : "Follow"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4 [touch-action:pan-y]">
          {loading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="skeleton-shimmer h-20 rounded-md" />
                ))}
              </div>
              <div className="space-y-2">
                <div className="skeleton-shimmer h-5 w-24 rounded-md" />
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="skeleton-shimmer h-20 rounded-md" />
                  ))}
                </div>
              </div>
              <div className="skeleton-shimmer h-32 rounded-md" />
            </div>
          ) : error ? (
            <p className="notice-error p-4 text-body-sm">{error}</p>
          ) : profile ? (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-2.5">
                <StatCard
                  label="Tokens launched"
                  value={String(profile.createdTokens.length)}
                />
                <StatCard
                  label="Followers"
                  value={profile.followerCount.toLocaleString()}
                />
              </section>

              <section>
                <h3 className="section-heading">Earnings</h3>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <StatCard
                    label="Creator fees"
                    value={formatUsdReadable(
                      bnbToUsd(profile.creatorFeesTotalBnb, bnbUsd),
                      { compact: true }
                    )}
                  />
                  <StatCard
                    label="Referral fees"
                    value={formatUsdReadable(
                      bnbToUsd(profile.referralFeesTotalBnb, bnbUsd),
                      { compact: true }
                    )}
                  />
                </div>
              </section>

              <section>
                <h3 className="section-heading">Holdings</h3>
                <p className="mt-1 text-caption text-pump-muted">
                  Token balances in this wallet, including self-launched coins.
                </p>
                {allHoldings.length === 0 ? (
                  <p className="mt-2 text-body-sm text-pump-muted">No token holdings yet.</p>
                ) : (
                  <div className="mt-2 max-h-[min(28dvh,220px)] overflow-y-auto overscroll-contain rounded-lg border border-pump-border/15 -mx-1 [touch-action:pan-x_pan-y]">
                    <table className="sheet-grid min-w-[400px]">
                      <thead className="border-b border-pump-border/15 bg-pump-surface/55 text-left">
                        <tr>
                          <th className="section-label px-3 py-2.5">Coin</th>
                          <th className="section-label px-3 py-2.5">Balance</th>
                          <th className="section-label px-3 py-2.5">Est. value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allHoldings.map((holding) => (
                          <HoldingRow
                            key={holding.tokenAddress}
                            holding={holding}
                            bnbUsd={bnbUsd}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="section-heading">Launched tokens</h3>
                {profile.createdTokens.length === 0 ? (
                  <p className="mt-2 text-body-sm text-pump-muted">No launched tokens yet.</p>
                ) : (
                  <div className="mt-2 max-h-[min(28dvh,220px)] overflow-y-auto overscroll-contain rounded-lg border border-pump-border/15 -mx-1 [touch-action:pan-x_pan-y]">
                    <table className="sheet-grid min-w-[520px]">
                      <thead className="border-b border-pump-border/15 bg-pump-surface/55 text-left">
                        <tr>
                          <th className="section-label px-3 py-2.5">Coin</th>
                          <th className="section-label px-3 py-2.5">Creator holds</th>
                          <th className="section-label px-3 py-2.5">Supply</th>
                          <th className="section-label px-3 py-2.5">Mcap</th>
                          <th className="section-label px-3 py-2.5 text-right">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.createdTokens.map((token) => (
                          <CreatedTokenRow key={token.address} token={token} bnbUsd={bnbUsd} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
