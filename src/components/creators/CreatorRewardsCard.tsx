"use client";

import { useAccount } from "wagmi";
import { explorerTxUrl, shortAddress } from "@/config/chain";
import { useCreatorFollows } from "@/components/creators/CreatorFollowsProvider";
import { CREATOR_FEE_SHARE_PCT } from "@/lib/bonding-curve";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";

function MoneyBagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current">
      <path
        d="M12 3v2M8 5h8a2 2 0 012 2v1a4 4 0 010 8v1a2 2 0 01-2 2H8a2 2 0 01-2-2v-1a4 4 0 010-8V7a2 2 0 012-2z"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 11v2" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type CreatorRewardsCardProps = {
  creatorAddress: string;
  launchTxHash: string;
  followerCount: number;
  onAddressClick?: (address: string) => void;
};

export function CreatorRewardsCard({
  creatorAddress,
  launchTxHash,
  followerCount,
  onAddressClick,
}: CreatorRewardsCardProps) {
  const { address } = useAccount();
  const { isFollowing, toggleFollow } = useCreatorFollows();

  const following = isFollowing(creatorAddress);
  const isSelf = address?.toLowerCase() === creatorAddress.toLowerCase();
  const timelineHref = launchTxHash ? explorerTxUrl(launchTxHash) : undefined;

  return (
    <section className="panel-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="section-label">Creator rewards</p>
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

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onAddressClick?.(creatorAddress)}
          disabled={!onAddressClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90 disabled:cursor-default disabled:hover:opacity-100"
          aria-label={`View creator profile ${shortAddress(creatorAddress)}`}
        >
          <UserAvatarForAddress address={creatorAddress} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-body-sm font-semibold financial-value text-pump-text">
                {shortAddress(creatorAddress)}
              </span>
              <span className="shrink-0 rounded-full bg-pump-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pump-accent">
                Creator
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-caption font-medium text-pump-success">
              <MoneyBagIcon />
              <span>{CREATOR_FEE_SHARE_PCT}%</span>
              {followerCount > 0 ? (
                <span className="text-pump-muted">
                  · {followerCount.toLocaleString()} follower
                  {followerCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>
        </button>

        {!isSelf ? (
          <button
            type="button"
            onClick={() => toggleFollow(creatorAddress)}
            className={
              following
                ? "secondary-button shrink-0 px-4 py-2 text-body-sm font-semibold"
                : "shrink-0 rounded-md bg-pump-surface/80 px-4 py-2 text-body-sm font-semibold text-pump-text ring-1 ring-pump-border/30 transition hover:bg-pump-surface"
            }
          >
            {following ? "Following" : "Follow"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
