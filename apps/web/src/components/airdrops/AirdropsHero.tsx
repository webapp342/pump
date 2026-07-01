"use client";

import type { ReactNode } from "react";
import { IconLabel } from "@/components/ui/IconLabel";
import { MetricIcons } from "@/lib/metric-icons";
import { formatUsdReadable } from "@/lib/format-usd";

type AirdropsHeroProps = {
  totalUsd: number | null;
  campaignCount: number;
  qualifyingCount: number;
  claimableCount: number;
  upcomingCount: number;
};

function AirdropsStatRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="airdrops-stat-row">
      <span className="airdrops-stat-row__label section-label">{label}</span>
      <span className="airdrops-stat-row__value financial-value">{children}</span>
    </div>
  );
}

export function AirdropsHero({
  totalUsd,
  campaignCount,
  qualifyingCount,
  claimableCount,
  upcomingCount,
}: AirdropsHeroProps) {
  return (
    <header className="airdrops-header">
      <div className="airdrops-page-head">
        <h1 className="page-title airdrops-page-head__title">Airdrops</h1>
      </div>

      <div className="airdrops-toolbar">
        <div className="airdrops-toolbar__shell">
          <div className="airdrops-toolbar__hero-row">
            <div className="airdrops-toolbar__rewards-block">
              <IconLabel
                icon={MetricIcons.totalRewards}
                hideIconMobile
                className="airdrops-stat-row__label section-label"
              >
                Total rewards
              </IconLabel>
              <p className="airdrops-toolbar__rewards-value financial-value">
                {totalUsd != null ? formatUsdReadable(totalUsd, { compact: true }) : "—"}
              </p>
              <p className="airdrops-toolbar__rewards-sub">
                {campaignCount} campaign{campaignCount === 1 ? "" : "s"} · USD est.
              </p>
            </div>

            <div className="airdrops-toolbar__stats-stack">
              <AirdropsStatRow label="Active">{qualifyingCount}</AirdropsStatRow>
              <AirdropsStatRow label="Claimable">{claimableCount}</AirdropsStatRow>
              <AirdropsStatRow label="Upcoming">{upcomingCount}</AirdropsStatRow>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
