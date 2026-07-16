"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import type { TokenAnnouncementRow } from "@/lib/db/token-announcements";
import { formatAge } from "@/lib/arena-board-format";

function formatMultiplierX(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
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
};

export function TokenAnnouncementsPanel({
  tokenAddress,
  refreshKey = 0,
  onOpenProfile,
  variant = "aside",
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
          No callouts yet. Announce this token to notify your followers.
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
            const identity = (
              <>
                <UserAvatarForAddress address={item.announcerAddress} size="lg" />
                <span className="token-announcements-panel__name">
                  {item.announcerDisplayUsername}
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
                  <span className="token-announcements-panel__x financial-value">
                    {formatMultiplierX(item.multiplierX)}
                  </span>
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

