"use client";

import type { ReactNode } from "react";
import { IconLabel } from "@/components/ui/IconLabel";
import { NATIVE_SYMBOL } from "@/config/chain";
import { MetricIcons } from "@/lib/metric-icons";

type MissionsHeroProps = {
  totalPoints: number;
  pointsToEarn: number;
  completedCount: number;
  totalCount: number;
  openCount: number;
  tradingVolumeBnb: number;
  guestMode?: boolean;
};

function MissionsStatRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="missions-stat-row">
      <span className="missions-stat-row__label section-label">{label}</span>
      <span className="missions-stat-row__value financial-value">{children}</span>
    </div>
  );
}

export function MissionsHero({
  totalPoints,
  pointsToEarn,
  completedCount,
  totalCount,
  openCount,
  tradingVolumeBnb,
  guestMode = false,
}: MissionsHeroProps) {
  return (
    <header className="missions-header">
      <div className="missions-page-head">
        <h1 className="page-title missions-page-head__title">Missions</h1>
      </div>

      <div className="missions-toolbar">
        <div className="missions-toolbar__shell">
          <div className="missions-toolbar__hero-row">
            <div className="missions-toolbar__points-block">
              <IconLabel
                icon={MetricIcons.pumpPoints}
                hideIconMobile
                className="missions-stat-row__label section-label"
              >
                Pump Points
              </IconLabel>
              <p className="missions-toolbar__points-value financial-value">
                {guestMode ? "0" : totalPoints.toLocaleString()}
              </p>
              <p className="missions-toolbar__points-sub">
                <span className="financial-value text-pump-accent">
                  +{pointsToEarn.toLocaleString()}
                </span>{" "}
                available
              </p>
            </div>

            <div className="missions-toolbar__stats-stack">
              <MissionsStatRow label="Completed">
                {guestMode ? "0" : completedCount}
                <span className="missions-stat-row__suffix">/{totalCount}</span>
              </MissionsStatRow>
              <MissionsStatRow label="Open">
                {guestMode ? totalCount : openCount}
              </MissionsStatRow>
              <MissionsStatRow label="Volume">
                {guestMode ? "0.00" : tradingVolumeBnb.toFixed(2)}{" "}
                <span className="missions-stat-row__unit">{NATIVE_SYMBOL}</span>
              </MissionsStatRow>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
