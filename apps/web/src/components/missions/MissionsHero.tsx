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

function MissionsStat({
  label,
  children,
  hero = false,
  accent = false,
}: {
  label: string;
  children: ReactNode;
  hero?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`missions-stat${hero ? " missions-stat--hero" : ""}`.trim()}>
      <span className="missions-stat__label section-label">{label}</span>
      <span
        className={`missions-stat__value financial-value${
          accent ? " missions-stat__value--accent" : ""
        }`.trim()}
      >
        {children}
      </span>
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
                className="missions-stat__label section-label"
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
          </div>

          <div className="missions-toolbar__divider" aria-hidden />

          <div className="missions-toolbar__stats-row">
            <MissionsStat label="Completed">
              {guestMode ? "0" : completedCount}
              <span className="missions-stat__suffix">/{totalCount}</span>
            </MissionsStat>
            <MissionsStat label="Open">{guestMode ? totalCount : openCount}</MissionsStat>
            <MissionsStat label="Volume">
              {guestMode ? "0.00" : tradingVolumeBnb.toFixed(2)}{" "}
              <span className="missions-stat__unit">{NATIVE_SYMBOL}</span>
            </MissionsStat>
          </div>
        </div>
      </div>
    </header>
  );
}
