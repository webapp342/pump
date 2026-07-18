"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import {
  liveCalloutMultiplierX,
  type TokenAnnouncementRow,
} from "@/lib/token-announcements-shared";
import { formatAge } from "@/lib/arena-board-format";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";

function formatMultiplierX(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 100) return `${value.toFixed(0)}x`;
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

type TokenAnnouncementsPanelProps = {
  tokenAddress: string;
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
  refreshKey = 0,
  onOpenProfile,
  variant = "aside",
  currentMarketCapBnb = null,
  bnbUsd = null,
}: TokenAnnouncementsPanelProps) {
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
            const identity = (
              <>
                <UserAvatarForAddress address={item.announcerAddress} size="md" />
                <span className="token-announcements-panel__identity-copy">
                  <span className="token-announcements-panel__name-row">
                    <span className="token-announcements-panel__name">
                      <UserDisplayName address={item.announcerAddress} compact />
                    </span>
                    <span
                      className={`token-announcements-panel__badge${
                        item.isSponsored ? " token-announcements-panel__badge--sponsored" : ""
                      }`}
                    >
                      {item.isSponsored ? "Sponsored" : "Callout"}
                    </span>
                  </span>
                  <span className="token-announcements-panel__called text-caption text-pump-muted">
                    Called at{" "}
                    <span className="financial-value">
                      {formatUsdReadable(calledUsd, { compact: true })}
                    </span>{" "}
                    MC
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
                <div className="token-announcements-panel__meta">
                  {liveX != null ? (
                    <span className="token-announcements-panel__x token-announcements-panel__x--live financial-value">
                      {formatMultiplierX(liveX)}
                    </span>
                  ) : (
                    <span className="token-announcements-panel__x financial-value">
                      {formatMultiplierX(item.multiplierX)}
                    </span>
                  )}
                  <span className="token-announcements-panel__time">
                    {formatAge(item.createdAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
