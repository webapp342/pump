"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CreatorProfile,
  CreatorProfileHolding,
  CreatorProfileToken,
} from "@/lib/db/launchpad";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { CalloutHoldingsSnapshot } from "@/components/token/CalloutHoldingsSnapshot";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { useCreatorFollows } from "@/components/creators/CreatorFollowsProvider";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { explorerAddressUrl, pumpChain } from "@/config/chain";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { PumpIcon, faExternalLink } from "@/lib/icons";
import { TOKEN_LOGO_SIZE_INLINE } from "@/lib/token-logo-sizes";
import { useAccount } from "wagmi";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import { formatAge } from "@/lib/arena-board-format";

type CreatorProfileData = CreatorProfile & {
  bnbBalance: string;
  creatorFeesPendingBnb: number;
  creatorFeesTotalBnb: number;
  referralFeesPendingBnb: number;
  referralFeesTotalBnb: number;
  hasStatusBadge?: boolean;
};

type CreatorFollowNetworkEntry = {
  address: string;
  displayUsername?: string;
  followedAt: string;
  latestTokenAddress: string | null;
};

type CreatorFollowNetworkResponse = {
  followingCount: number;
  followerCount: number;
  following: CreatorFollowNetworkEntry[];
  followers: CreatorFollowNetworkEntry[];
};

type PortfolioAnnouncementRow = {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenLogoUrl: string | null;
  multiplierX: number;
  tokenBalanceAtAnnounce: number | null;
  tokenBalanceUsdAtAnnounce: number | null;
  createdAt: string;
};

type CreatorProfileTab = "holdings" | "launched" | "callouts" | "following";

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

const CREATOR_PROFILE_TABS: ReadonlyArray<{ id: CreatorProfileTab; label: string }> = [
  { id: "holdings", label: "Holdings" },
  { id: "launched", label: "Launched" },
  { id: "callouts", label: "Callouts" },
  { id: "following", label: "Following" },
];

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function CreatedTokenRow({
  token,
  bnbUsd,
}: {
  token: CreatorProfileToken;
  bnbUsd: number | null;
}) {
  const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd);

  return (
    <tr className="creator-profile-sheet__row">
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--coin">
        <Link href={`/token/${token.address}`} className="creator-profile-sheet__coin-link">
          <TokenAvatar
            address={token.address}
            symbol={token.symbol}
            logoUrl={token.logoUrl}
            size={TOKEN_LOGO_SIZE_INLINE}
          />
          <span className="creator-profile-sheet__coin-copy min-w-0">
            <span className="creator-profile-sheet__coin-name">{token.name}</span>
            <span className="creator-profile-sheet__coin-symbol">{token.symbol}</span>
          </span>
        </Link>
      </td>
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--num">
        <span className="financial-value">
          {formatUsdReadable(mcapUsd, { compact: true })}
        </span>
      </td>
    </tr>
  );
}

function CalloutRow({ row }: { row: PortfolioAnnouncementRow }) {
  return (
    <tr className="creator-profile-sheet__row">
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--coin">
        <Link href={`/token/${row.tokenAddress}`} className="creator-profile-sheet__coin-link">
          <TokenAvatar
            address={row.tokenAddress}
            symbol={row.tokenSymbol}
            logoUrl={row.tokenLogoUrl}
            size={TOKEN_LOGO_SIZE_INLINE}
          />
          <span className="creator-profile-sheet__coin-copy min-w-0">
            <span className="creator-profile-sheet__coin-name">{row.tokenName}</span>
            <span className="creator-profile-sheet__coin-symbol">{row.tokenSymbol}</span>
            <CalloutHoldingsSnapshot
              balance={row.tokenBalanceAtAnnounce}
              balanceUsd={row.tokenBalanceUsdAtAnnounce}
            />
          </span>
        </Link>
      </td>
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--balance">
        <div className="creator-profile-sheet__balance-stack">
          <span className="creator-profile-sheet__balance-amount financial-value">
            {row.multiplierX.toFixed(2)}x
          </span>
          <span className="creator-profile-sheet__balance-value financial-value">
            {formatAge(row.createdAt)}
          </span>
        </div>
      </td>
    </tr>
  );
}

function FollowingRow({ row }: { row: CreatorFollowNetworkEntry }) {
  return (
    <tr className="creator-profile-sheet__row">
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--coin">
        <div className="creator-profile-sheet__coin-link">
          <UserAvatarForAddress address={row.address} size="lg" />
          <span className="creator-profile-sheet__coin-copy min-w-0">
            <span className="creator-profile-sheet__coin-name">
              <UserDisplayName address={row.address} compact />
            </span>
            <span className="creator-profile-sheet__coin-symbol">{formatShortDate(row.followedAt)}</span>
          </span>
        </div>
      </td>
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--num">
        {row.latestTokenAddress ? (
          <Link href={`/token/${row.latestTokenAddress}`} className="creator-profile-sheet__inline-link">
            Token
          </Link>
        ) : (
          <span className="creator-profile-sheet__muted">—</span>
        )}
      </td>
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
  const valueLabel = formatUsdReadable(valueUsd, { compact: true });

  return (
    <tr className="creator-profile-sheet__row">
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--coin">
        <Link
          href={`/token/${holding.tokenAddress}`}
          className="creator-profile-sheet__coin-link"
        >
          <TokenAvatar
            address={holding.tokenAddress}
            symbol={holding.symbol}
            logoUrl={holding.logoUrl}
            size={TOKEN_LOGO_SIZE_INLINE}
          />
          <span className="creator-profile-sheet__coin-copy min-w-0">
            <span className="creator-profile-sheet__coin-name">{holding.name}</span>
            <span className="creator-profile-sheet__coin-symbol">{holding.symbol}</span>
          </span>
        </Link>
      </td>
      <td className="creator-profile-sheet__cell creator-profile-sheet__cell--balance">
        <div className="creator-profile-sheet__balance-stack">
          <span className="creator-profile-sheet__balance-amount financial-value">
            {formatTokenAmount(balance)}
          </span>
          <span className="creator-profile-sheet__balance-value financial-value">{valueLabel}</span>
        </div>
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
  const [activeTab, setActiveTab] = useState<CreatorProfileTab>("holdings");
  const [callouts, setCallouts] = useState<PortfolioAnnouncementRow[]>([]);
  const [followingRows, setFollowingRows] = useState<CreatorFollowNetworkEntry[]>([]);

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

  useEffect(() => {
    if (!open || !creatorAddress) return;
    let cancelled = false;
    void (async () => {
      try {
        const [calloutsRes, networkRes] = await Promise.all([
          fetch(`/api/portfolio/announcements?address=${encodeURIComponent(creatorAddress)}&limit=25`, {
            cache: "no-store",
          }),
          fetch(`/api/creators/follows/network?address=${encodeURIComponent(creatorAddress)}&limit=25`, {
            cache: "no-store",
          }),
        ]);
        const calloutsBody = (await calloutsRes.json()) as {
          data?: { announcements?: PortfolioAnnouncementRow[] };
        };
        const networkBody = (await networkRes.json()) as {
          data?: CreatorFollowNetworkResponse;
        };
        if (cancelled) return;
        setCallouts(calloutsBody.data?.announcements ?? []);
        setFollowingRows(networkBody.data?.following ?? []);
      } catch {
        if (cancelled) return;
        setCallouts([]);
        setFollowingRows([]);
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

  if (!open) return null;

  const isSelf = address?.toLowerCase() === creatorAddress.toLowerCase();
  const following = isFollowing(creatorAddress);

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Creator profile"
      zIndex={110}
      panelClassName="creator-profile-sheet max-w-2xl max-h-[min(90dvh,680px)] sm:max-h-[min(72vh,640px)]"
      bodyClassName="creator-profile-sheet__body"
      hideCloseButton
    >
      {loading ? (
        <div className="creator-profile-sheet__loading" aria-busy="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton-shimmer creator-profile-sheet__skeleton-row" />
          ))}
        </div>
      ) : error ? (
        <p className="creator-profile-sheet__notice notice-error">{error}</p>
      ) : profile ? (
        <div className="creator-profile-sheet__sections">
          <section className="creator-profile-sheet__profile-head">
            <div
              className={
                isSelf
                  ? "creator-profile-sheet__identity-row"
                  : "creator-profile-sheet__identity-row creator-profile-sheet__identity-row--with-follow"
              }
            >
              <UserAvatarForAddress
                address={creatorAddress}
                size="2xl"
                framed={Boolean(profile.hasStatusBadge)}
                className="creator-profile-sheet__avatar"
              />
              <div className="creator-profile-sheet__identity-copy min-w-0">
                <div className="creator-profile-sheet__name-row">
                  <p
                    id="creator-profile-title"
                    className={`creator-profile-sheet__title${
                      profile.hasStatusBadge ? " identity-name--premium" : ""
                    }`}
                    role="heading"
                    aria-level={2}
                  >
                    {profile.displayUsername ?? (
                      <UserDisplayName
                        address={creatorAddress}
                        hasStatusBadge={Boolean(profile.hasStatusBadge)}
                        compact
                      />
                    )}
                  </p>
                  <a
                    href={explorerAddressUrl(creatorAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="creator-profile-sheet__explorer-link"
                    aria-label={`View on ${pumpChain.blockExplorers.default.name}`}
                  >
                    <PumpIcon icon={faExternalLink} className="creator-profile-sheet__explorer-icon" />
                  </a>
                </div>
                <p className="creator-profile-sheet__social-text">
                  <span className="creator-profile-sheet__social-stat">
                    <span className="creator-profile-sheet__social-label">Followers</span>
                    <strong className="creator-profile-sheet__social-value">
                      {profile.followerCount.toLocaleString()}
                    </strong>
                  </span>
                  <span className="creator-profile-sheet__social-sep" aria-hidden>
                    ·
                  </span>
                  <span className="creator-profile-sheet__social-stat">
                    <span className="creator-profile-sheet__social-label">Following</span>
                    <strong className="creator-profile-sheet__social-value">
                      {profile.followingCount.toLocaleString()}
                    </strong>
                  </span>
                </p>
              </div>
              {!isSelf ? (
                <button
                  type="button"
                  onClick={() => toggleFollow(creatorAddress)}
                  className={
                    following
                      ? "secondary-button creator-profile-sheet__follow-btn"
                      : "primary-button creator-profile-sheet__follow-btn"
                  }
                >
                  {following ? "Following" : "Follow"}
                </button>
              ) : null}
            </div>
          </section>

          <section className="creator-profile-sheet__earnings">
            <div className="creator-profile-sheet__earnings-grid">
              <div className="creator-profile-sheet__earnings-cell">
                <span className="creator-profile-sheet__earnings-label">Creator earnings</span>
                <span className="creator-profile-sheet__earnings-value financial-value">
                  {formatUsdReadable(bnbToUsd(profile.creatorFeesTotalBnb, bnbUsd) ?? 0, {
                    compact: true,
                  })}
                </span>
              </div>
              <div className="creator-profile-sheet__earnings-cell">
                <span className="creator-profile-sheet__earnings-label">Referral earnings</span>
                <span className="creator-profile-sheet__earnings-value financial-value">
                  {formatUsdReadable(bnbToUsd(profile.referralFeesTotalBnb, bnbUsd) ?? 0, {
                    compact: true,
                  })}
                </span>
              </div>
            </div>
          </section>

          <nav className="creator-profile-sheet__tab-nav" aria-label="Creator sections">
            <div className="creator-profile-sheet__tab-track" role="tablist">
              {CREATOR_PROFILE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={
                    activeTab === tab.id
                      ? "creator-profile-sheet__tab-item creator-profile-sheet__tab-item--active"
                      : "creator-profile-sheet__tab-item"
                  }
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="creator-profile-sheet__tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </nav>

          <section className="creator-profile-sheet__section creator-profile-sheet__section--last">
            {activeTab === "holdings" ? (
              <>
                {allHoldings.length === 0 ? (
                  <p className="creator-profile-sheet__empty">No token holdings yet.</p>
                ) : (
                  <div className="creator-profile-sheet__table-wrap">
                    <table className="creator-profile-sheet__table">
                      <thead>
                        <tr>
                          <th className="creator-profile-sheet__head">Coin</th>
                          <th className="creator-profile-sheet__head creator-profile-sheet__head--num">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allHoldings.map((holding) => (
                          <HoldingRow key={holding.tokenAddress} holding={holding} bnbUsd={bnbUsd} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}

            {activeTab === "launched" ? (
              <>
                {profile.createdTokens.length === 0 ? (
                  <p className="creator-profile-sheet__empty">No launched tokens yet.</p>
                ) : (
                  <div className="creator-profile-sheet__table-wrap">
                    <table className="creator-profile-sheet__table">
                      <thead>
                        <tr>
                          <th className="creator-profile-sheet__head">Coin</th>
                          <th className="creator-profile-sheet__head creator-profile-sheet__head--num">Mcap</th>
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
              </>
            ) : null}

            {activeTab === "callouts" ? (
              <>
                {callouts.length === 0 ? (
                  <p className="creator-profile-sheet__empty">No callouts yet.</p>
                ) : (
                  <div className="creator-profile-sheet__table-wrap">
                    <table className="creator-profile-sheet__table">
                      <thead>
                        <tr>
                          <th className="creator-profile-sheet__head">Coin</th>
                          <th className="creator-profile-sheet__head creator-profile-sheet__head--num">
                            Callout
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {callouts.map((row) => (
                          <CalloutRow key={row.id} row={row} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}

            {activeTab === "following" ? (
              <>
                {followingRows.length === 0 ? (
                  <p className="creator-profile-sheet__empty">Not following anyone yet.</p>
                ) : (
                  <div className="creator-profile-sheet__table-wrap">
                    <table className="creator-profile-sheet__table">
                      <thead>
                        <tr>
                          <th className="creator-profile-sheet__head">Creator</th>
                          <th className="creator-profile-sheet__head creator-profile-sheet__head--num">Last token</th>
                        </tr>
                      </thead>
                      <tbody>
                        {followingRows.map((row) => (
                          <FollowingRow key={`${row.address}-${row.followedAt}`} row={row} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </AppBottomSheet>
  );
}
