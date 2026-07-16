"use client";

import type { ReactNode } from "react";
import { MissionsFilterNav } from "@/components/missions/MissionsFilterNav";
import { MissionsList } from "@/components/missions/MissionList";
import { PointsActivityPanel } from "@/components/missions/PointsActivityPanel";
import { PointsLevelLadder } from "@/components/missions/PointsLevelLadder";
import { PointsMarketGrid } from "@/components/missions/PointsMarketGrid";
import type { MissionListItem } from "@/lib/missions-guest-data";
import type { MissionFilter } from "@/lib/missions-types";
import type { PointsLevelStatus } from "@/lib/points-levels";
import type { PointsHubTab } from "@/lib/points-hub-tabs";
import type { PointsMarketItem } from "@/lib/points-market-catalog";

type PointsOverviewProps = {
  level: PointsLevelStatus;
  spendablePoints: number;
  openMissions: MissionListItem[];
  guestMode?: boolean;
  pendingKeys?: string[];
  completingKey?: string | null;
  redeemingId?: string | null;
  onAdminLinkClick?: (mission: MissionListItem) => void;
  onRedeem?: (item: PointsMarketItem) => void;
  onGoEarn: () => void;
  onGoMarket: () => void;
  footerSlot?: ReactNode;
};

export function PointsOverview({
  level,
  spendablePoints,
  openMissions,
  guestMode = false,
  pendingKeys = [],
  completingKey = null,
  redeemingId = null,
  onAdminLinkClick,
  onRedeem,
  onGoEarn,
  onGoMarket,
  footerSlot,
}: PointsOverviewProps) {
  const preview = openMissions.slice(0, 4);

  return (
    <div className="points-overview">
      <div className="points-overview__market">
        <PointsMarketGrid
          level={level}
          spendablePoints={spendablePoints}
          guestMode={guestMode}
          featuredOnly
          redeemingId={redeemingId}
          onRedeem={onRedeem}
        />
        <button type="button" className="chip-button points-overview__link" onClick={onGoMarket}>
          View market
        </button>
      </div>

      <div className="points-overview__earn">
        <header className="points-overview__section-head">
          <h2 className="section-heading">Open missions</h2>
          <button type="button" className="chip-button" onClick={onGoEarn}>
            All earn
          </button>
        </header>
        {preview.length > 0 ? (
          <MissionsList
            missions={preview}
            guestMode={guestMode}
            pendingKeys={pendingKeys}
            completingKey={completingKey}
            onAdminLinkClick={onAdminLinkClick}
            footerSlot={footerSlot}
          />
        ) : (
          <div className="empty-state missions-empty-state">
            <p className="empty-state-copy">All caught up.</p>
          </div>
        )}
      </div>

      <div className="points-overview__levels md:hidden">
        <PointsLevelLadder level={level} guestMode={guestMode} compact />
      </div>
    </div>
  );
}

type PointsEarnPanelProps = {
  missions: MissionListItem[];
  activeFilter: MissionFilter;
  filterCounts: Record<MissionFilter, number>;
  loading: boolean;
  guestMode?: boolean;
  pendingKeys?: string[];
  completingKey?: string | null;
  onSelectFilter: (filter: MissionFilter) => void;
  onRefresh: () => void;
  onAdminLinkClick?: (mission: MissionListItem) => void;
  footerSlot?: ReactNode;
  emptyCopy: string;
};

export function PointsEarnPanel({
  missions,
  activeFilter,
  filterCounts,
  loading,
  guestMode = false,
  pendingKeys = [],
  completingKey = null,
  onSelectFilter,
  onRefresh,
  onAdminLinkClick,
  footerSlot,
  emptyCopy,
}: PointsEarnPanelProps) {
  return (
    <div className="points-earn">
      <MissionsFilterNav
        activeFilter={activeFilter}
        filterCounts={filterCounts}
        loading={loading}
        onSelect={onSelectFilter}
        onRefresh={onRefresh}
      />
      <div className="missions-body">
        {missions.length > 0 ? (
          <MissionsList
            missions={missions}
            guestMode={guestMode}
            pendingKeys={pendingKeys}
            completingKey={completingKey}
            onAdminLinkClick={onAdminLinkClick}
            footerSlot={footerSlot}
          />
        ) : (
          <div className="empty-state missions-empty-state">
            <p className="empty-state-copy">{emptyCopy}</p>
            {footerSlot}
          </div>
        )}
      </div>
    </div>
  );
}

type PointsHubBodyProps = {
  tab: PointsHubTab;
  level: PointsLevelStatus;
  spendablePoints: number;
  address?: string;
  openMissions: MissionListItem[];
  boardMissions: MissionListItem[];
  activeFilter: MissionFilter;
  filterCounts: Record<MissionFilter, number>;
  loading: boolean;
  guestMode?: boolean;
  pendingKeys?: string[];
  completingKey?: string | null;
  redeemingId?: string | null;
  onSelectFilter: (filter: MissionFilter) => void;
  onRefresh: () => void;
  onAdminLinkClick?: (mission: MissionListItem) => void;
  onRedeem?: (item: PointsMarketItem) => void;
  onSelectTab: (tab: PointsHubTab) => void;
  footerSlot?: ReactNode;
};

export function PointsHubBody({
  tab,
  level,
  spendablePoints,
  address = "",
  openMissions,
  boardMissions,
  activeFilter,
  filterCounts,
  loading,
  guestMode = false,
  pendingKeys = [],
  completingKey = null,
  redeemingId = null,
  onSelectFilter,
  onRefresh,
  onAdminLinkClick,
  onRedeem,
  onSelectTab,
  footerSlot,
}: PointsHubBodyProps) {
  if (tab === "overview") {
    return (
      <PointsOverview
        level={level}
        spendablePoints={spendablePoints}
        openMissions={openMissions}
        guestMode={guestMode}
        pendingKeys={pendingKeys}
        completingKey={completingKey}
        redeemingId={redeemingId}
        onAdminLinkClick={onAdminLinkClick}
        onRedeem={onRedeem}
        onGoEarn={() => onSelectTab("earn")}
        onGoMarket={() => onSelectTab("market")}
        footerSlot={footerSlot}
      />
    );
  }

  if (tab === "levels") {
    return (
      <div className="points-hub-panel">
        <PointsLevelLadder level={level} guestMode={guestMode} />
      </div>
    );
  }

  if (tab === "market") {
    return (
      <div className="points-hub-panel">
        <PointsMarketGrid
          level={level}
          spendablePoints={spendablePoints}
          guestMode={guestMode}
          redeemingId={redeemingId}
          onRedeem={onRedeem}
        />
      </div>
    );
  }

  if (tab === "activity") {
    return <PointsActivityPanel address={address} guestMode={guestMode} />;
  }

  return (
    <PointsEarnPanel
      missions={boardMissions}
      activeFilter={activeFilter}
      filterCounts={filterCounts}
      loading={loading}
      guestMode={guestMode}
      pendingKeys={pendingKeys}
      completingKey={completingKey}
      onSelectFilter={onSelectFilter}
      onRefresh={onRefresh}
      onAdminLinkClick={onAdminLinkClick}
      footerSlot={footerSlot}
      emptyCopy={activeFilter === "done" ? "Nothing completed yet." : "All caught up."}
    />
  );
}
