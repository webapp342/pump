"use client";

import type { ReactNode } from "react";
import { MissionsFilterNav } from "@/components/missions/MissionsFilterNav";
import { MissionsList } from "@/components/missions/MissionList";
import { PointsLeaderboardPanel } from "@/components/missions/PointsLeaderboardPanel";
import { PointsMarketPanel } from "@/components/missions/PointsMarketPanel";
import type { MissionListItem } from "@/lib/missions-guest-data";
import type { MissionFilter } from "@/lib/missions-types";
import type { PointsLevelStatus } from "@/lib/points-levels";
import type { PointsHubTab, PointsMarketView } from "@/lib/points-hub-tabs";
import type { PointsMarketItem } from "@/lib/points-market-catalog";
import { REWARDS_CHALLENGES } from "@/lib/rewards-copy";

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
  onReferralClaim?: (mission: MissionListItem) => void;
  onReferralInvite?: (mission: MissionListItem) => void;
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
  onReferralClaim,
  onReferralInvite,
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
            onReferralClaim={onReferralClaim}
            onReferralInvite={onReferralInvite}
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
  marketView: PointsMarketView;
  onSelectMarketView: (view: PointsMarketView) => void;
  level: PointsLevelStatus;
  spendablePoints: number;
  address?: string;
  boardMissions: MissionListItem[];
  activeFilter: MissionFilter;
  filterCounts: Record<MissionFilter, number>;
  loading: boolean;
  guestMode?: boolean;
  pendingKeys?: string[];
  completingKey?: string | null;
  redeemingId?: string | null;
  inventoryRefreshKey?: number;
  leaderboardRefreshKey?: number;
  onSelectFilter: (filter: MissionFilter) => void;
  onRefresh: () => void;
  onAdminLinkClick?: (mission: MissionListItem) => void;
  onReferralClaim?: (mission: MissionListItem) => void;
  onReferralInvite?: (mission: MissionListItem) => void;
  onRedeem?: (item: PointsMarketItem) => void;
  footerSlot?: ReactNode;
};

export function PointsHubBody({
  tab,
  marketView,
  onSelectMarketView,
  level,
  spendablePoints,
  address = "",
  boardMissions,
  activeFilter,
  filterCounts,
  loading,
  guestMode = false,
  pendingKeys = [],
  completingKey = null,
  redeemingId = null,
  inventoryRefreshKey = 0,
  leaderboardRefreshKey = 0,
  onSelectFilter,
  onRefresh,
  onAdminLinkClick,
  onReferralClaim,
  onReferralInvite,
  onRedeem,
  footerSlot,
}: PointsHubBodyProps) {
  if (tab === "leaderboard") {
    return <PointsLeaderboardPanel address={address} refreshKey={leaderboardRefreshKey} />;
  }

  if (tab === "market") {
    return (
      <PointsMarketPanel
        view={marketView}
        onSelectView={onSelectMarketView}
        level={level}
        spendablePoints={spendablePoints}
        address={address}
        guestMode={guestMode}
        redeemingId={redeemingId}
        inventoryRefreshKey={inventoryRefreshKey}
        loading={loading}
        onRefresh={onRefresh}
        onRedeem={onRedeem}
      />
    );
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
      onReferralClaim={onReferralClaim}
      onReferralInvite={onReferralInvite}
      footerSlot={footerSlot}
      emptyCopy={
        activeFilter === "done" ? REWARDS_CHALLENGES.emptyDone : REWARDS_CHALLENGES.emptyOpen
      }
    />
  );
}
