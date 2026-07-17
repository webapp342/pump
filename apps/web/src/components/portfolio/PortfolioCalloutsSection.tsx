"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalloutHoldingsSnapshot } from "@/components/token/CalloutHoldingsSnapshot";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import type { PortfolioAnnouncementRow } from "@/lib/token-announcements-shared";
import { formatAge } from "@/lib/arena-board-format";

function formatMultiplierX(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 100) return `${value.toFixed(0)}x`;
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

export function PortfolioCalloutsSection({ address }: { address: string }) {
  const [items, setItems] = useState<PortfolioAnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/portfolio/announcements?address=${encodeURIComponent(address)}&limit=50`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as {
        data?: { announcements?: PortfolioAnnouncementRow[] };
      };
      setItems(response.ok ? (body.data?.announcements ?? []) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="panel-surface empty-state flex flex-col items-center justify-center py-10">
        <p className="empty-state-copy">Loading…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="panel-surface empty-state flex flex-col items-center justify-center py-10">
        <p className="empty-state-copy">No callouts yet.</p>
        <p className="mt-2 max-w-sm text-center text-caption text-pump-muted">
          Announce a token from its page to notify followers and build your history.
        </p>
        <Link href="/arena" className="chip-button chip-button-active mt-4 px-4 py-1.5 text-caption">
          Explore Arena
        </Link>
      </div>
    );
  }

  return (
    <section
      className="panel-surface portfolio-section-surface portfolio-tab-panel__surface portfolio-callouts"
      aria-label="Callouts"
    >
      <ul className="portfolio-callouts__list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/token/${encodeURIComponent(item.tokenAddress)}`}
              className="portfolio-callouts__row"
            >
              <TokenAvatar
                address={item.tokenAddress}
                symbol={item.tokenSymbol}
                logoUrl={item.tokenLogoUrl}
                size="2xl"
              />
              <div className="portfolio-callouts__token">
                <span className="portfolio-callouts__symbol">{item.tokenSymbol}</span>
                <span className="portfolio-callouts__name text-pump-muted">{item.tokenName}</span>
                <CalloutHoldingsSnapshot
                  tokenAddress={item.tokenAddress}
                  tokenSymbol={item.tokenSymbol}
                  tokenLogoUrl={item.tokenLogoUrl}
                  balance={item.tokenBalanceAtAnnounce}
                  balanceUsd={item.tokenBalanceUsdAtAnnounce}
                />
              </div>
              <div className="portfolio-callouts__meta">
                <span className="portfolio-callouts__x financial-value">
                  {formatMultiplierX(item.multiplierX)}
                </span>
                <span className="portfolio-callouts__time">{formatAge(item.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
