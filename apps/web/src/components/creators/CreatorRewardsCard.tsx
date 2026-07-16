"use client";

import { useAccount } from "wagmi";
import type { Address } from "viem";
import { explorerTxUrl } from "@/config/chain";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { useCreatorFollows } from "@/components/creators/CreatorFollowsProvider";
import { PumpIcon, faUsers, faWallet } from "@/lib/icons";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { useWalletTotalBalance } from "@/hooks/useWalletTotalBalance";

type CreatorRewardsCardProps = {
  creatorAddress: string;
  creatorDisplayUsername?: string;
  launchTxHash: string;
  followerCount: number;
  onAddressClick?: (address: string) => void;
  /** Mobile trade tape About tab — full-bleed bordered body. */
  layout?: "default" | "tape";
};

function formatWalletUsdTotal(usd: number): string {
  if (!Number.isFinite(usd)) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

export function CreatorRewardsCard({
  creatorAddress,
  creatorDisplayUsername,
  launchTxHash,
  followerCount,
  onAddressClick,
  layout = "default",
}: CreatorRewardsCardProps) {
  const { address } = useAccount();
  const { isFollowing, toggleFollow } = useCreatorFollows();
  const { totalUsd } = useWalletTotalBalance(creatorAddress as Address);

  const following = isFollowing(creatorAddress);
  const isSelf = address?.toLowerCase() === creatorAddress.toLowerCase();
  const timelineHref = launchTxHash ? explorerTxUrl(launchTxHash) : undefined;

  return (
    <section
      className={
        layout === "tape"
          ? "creator-rewards-card creator-rewards-card--tape"
          : "creator-rewards-card"
      }
    >
      <div className="creator-rewards-card__header">
        <p className="section-label">Coin creator</p>
        {timelineHref ? (
          <a
            href={timelineHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-caption font-medium text-pump-success hover:underline"
          >
            Coin timeline
          </a>
        ) : null}
      </div>

      <div className="creator-rewards-card__body">
        <div className="creator-rewards-card__row">
          <button
            type="button"
            onClick={() => onAddressClick?.(creatorAddress)}
            disabled={!onAddressClick}
            className="creator-rewards-card__identity"
            aria-label={`View creator profile ${creatorDisplayUsername ?? creatorAddress}`}
          >
            <UserAvatarForAddress address={creatorAddress} size="2xl" />
            <div className="creator-rewards-card__identity-copy">
              <span className="creator-rewards-card__name financial-value">
                {creatorDisplayUsername ?? (
                  <UserDisplayName address={creatorAddress} compact />
                )}
              </span>
              <div className="creator-rewards-card__meta">
                <span className="creator-rewards-card__meta-item">
                  <PumpIcon icon={faWallet} className="creator-rewards-card__meta-icon" aria-hidden />
                  <span className="financial-value">{formatWalletUsdTotal(totalUsd)}</span>
                </span>
                <span className="creator-rewards-card__meta-item">
                  <PumpIcon icon={faUsers} className="creator-rewards-card__meta-icon" aria-hidden />
                  <span className="financial-value">
                    {Math.max(0, followerCount).toLocaleString()}
                  </span>
                </span>
              </div>
            </div>
          </button>

          {!isSelf ? (
            <button
              type="button"
              onClick={() => toggleFollow(creatorAddress)}
              className={
                following
                  ? "secondary-button creator-rewards-card__follow shrink-0"
                  : "creator-rewards-card__follow shrink-0 rounded-md bg-pump-surface/80 px-4 py-2 text-body-sm font-semibold text-pump-text ring-1 ring-pump-border/30 transition hover:bg-pump-surface"
              }
            >
              {following ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
