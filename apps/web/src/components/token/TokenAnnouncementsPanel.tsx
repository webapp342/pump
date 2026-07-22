"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { useCreatorFollows } from "@/components/creators/CreatorFollowsProvider";
import { PumpIcon, faFollowAdd, faUnfollowPeople, faWellness } from "@/lib/icons";
import { routeAddressKeysEqual } from "@/lib/address";
import {
  liveCalloutMultiplierX,
  type TokenAnnouncementRow,
} from "@/lib/token-announcements-shared";
import { formatAge, formatArenaQuoteUsd } from "@/lib/arena-board-format";
import { bnbToUsd } from "@/lib/format-usd";
import { normalizeAddressParam } from "@/lib/address";

function formatMultiplierX(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 100) return `${value.toFixed(0)}x`;
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

function CreatorBadge() {
  return (
    <span
      className="token-tape-creator-icon inline-flex shrink-0 items-center justify-center text-pump-accent"
      title="Creator"
      aria-label="Creator"
    >
      <PumpIcon icon={faWellness} className="token-tape-creator-icon__glyph" aria-hidden />
    </span>
  );
}

type TokenAnnouncementsPanelProps = {
  tokenAddress: string;
  /** Token creator — show wellness icon when announcer matches. */
  creatorAddress?: string | null;
  refreshKey?: number;
  onOpenProfile?: (address: string) => void;
  /** aside = desktop callout card; tape = Social / About feed (no nested panel). */
  variant?: "aside" | "tape";
  /** Live token mcap (BNB/ETH units) — already on the page; no extra fetch. */
  currentMarketCapBnb?: number | string | null;
  bnbUsd?: number | null;
};

export function TokenAnnouncementsPanel({
  tokenAddress,
  creatorAddress = null,
  refreshKey = 0,
  onOpenProfile,
  variant = "aside",
  currentMarketCapBnb = null,
  bnbUsd = null,
}: TokenAnnouncementsPanelProps) {
  const { address } = useActiveWalletAddress();
  const { isFollowing, toggleFollow } = useCreatorFollows();
  const [items, setItems] = useState<TokenAnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/tokens/${encodeURIComponent(tokenAddress)}/announcements?limit=30`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as {
        data?: { announcements?: TokenAnnouncementRow[] };
      };
      setItems(response.ok ? (body.data?.announcements ?? []) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tokenAddress]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const currentMcap = Number(currentMarketCapBnb);

  const shellClass =
    variant === "tape"
      ? "token-tape-social-panel token-announcements-panel token-announcements-panel--tape"
      : "panel-surface p-4 token-announcements-panel";

  return (
    <section className={shellClass} aria-label="Callouts">
      {variant === "aside" ? <p className="section-label">Callouts</p> : null}

      {loading ? (
        <p className={`${variant === "aside" ? "mt-3" : ""} text-caption text-pump-muted`}>
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p
          className={`${
            variant === "aside" ? "mt-3" : ""
          } text-body-sm leading-relaxed text-pump-muted`}
        >
          No callouts yet.
        </p>
      ) : (
        <ul
          className={
            variant === "aside"
              ? "token-announcements-panel__list"
              : "token-announcements-panel__list token-announcements-panel__list--tape"
          }
        >
          {items.map((item) => {
            const liveX = liveCalloutMultiplierX(currentMcap, item.marketCapZugAtAnnounce);
            const calledUsd = bnbToUsd(Number(item.marketCapZugAtAnnounce), bnbUsd);
            const self = address ? normalizeAddressParam(address) : null;
            const announcer = normalizeAddressParam(item.announcerAddress);
            const isSelf = Boolean(self) && self === announcer;
            const following = isFollowing(item.announcerAddress);
            const xLabel = liveX != null ? formatMultiplierX(liveX) : null;
            const isCreator = Boolean(
              creatorAddress && routeAddressKeysEqual(item.announcerAddress, creatorAddress)
            );

            const identity = (
              <>
                <UserAvatarForAddress
                  address={item.announcerAddress}
                  size="2xl"
                  className="token-announcements-panel__avatar"
                />
                <span className="token-announcements-panel__identity-copy">
                  <span className="token-announcements-panel__name-row">
                    <span className="token-announcements-panel__name">
                      <UserDisplayName
                        address={item.announcerAddress}
                        username={item.announcerDisplayUsername}
                        compact
                      />
                    </span>
                    {isCreator ? <CreatorBadge /> : null}
                    <span className="token-announcements-panel__chips">
                      <span
                        className={`token-announcements-panel__badge${
                          item.isSponsored ? " token-announcements-panel__badge--sponsored" : ""
                        }`}
                      >
                        {item.isSponsored ? "Sponsored" : "Callout"}
                      </span>
                      <span className="token-announcements-panel__time">
                        {formatAge(item.createdAt)}
                      </span>
                    </span>
                  </span>
                  <span className="token-announcements-panel__called">
                    <span className="token-announcements-panel__called-text">
                      at{" "}
                      <span className="financial-value">
                        {formatArenaQuoteUsd(calledUsd)}
                      </span>{" "}
                      MC
                    </span>
                    {xLabel ? (
                      <span className="token-announcements-panel__x token-announcements-panel__x--live financial-value">
                        {xLabel}
                      </span>
                    ) : null}
                  </span>
                  {item.message ? (
                    <span className="token-announcements-panel__message">{item.message}</span>
                  ) : null}
                </span>
              </>
            );

            return (
              <li key={item.id} className="token-announcements-panel__row">
                {onOpenProfile ? (
                  <button
                    type="button"
                    className="token-announcements-panel__identity"
                    onClick={() => onOpenProfile(item.announcerAddress)}
                  >
                    {identity}
                  </button>
                ) : (
                  <Link
                    href={`/portfolio?address=${encodeURIComponent(item.announcerAddress)}`}
                    className="token-announcements-panel__identity"
                  >
                    {identity}
                  </Link>
                )}
                {!isSelf ? (
                  <button
                    type="button"
                    className={`token-announcements-panel__follow${
                      following ? " token-announcements-panel__follow--on" : ""
                    }`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleFollow(item.announcerAddress);
                    }}
                    aria-pressed={following}
                    aria-label={following ? "Unfollow" : "Follow"}
                    title={following ? "Unfollow" : "Follow"}
                  >
                    <PumpIcon
                      icon={following ? faUnfollowPeople : faFollowAdd}
                      size="sm"
                      aria-hidden
                    />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
