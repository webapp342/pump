"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PointsHubBody } from "@/components/missions/PointsHubBody";
import { PointsHubTabs } from "@/components/missions/PointsHubTabs";
import { PointsLevelLadder } from "@/components/missions/PointsLevelLadder";
import { PointsStatusCard } from "@/components/missions/PointsStatusCard";
import {
  GUEST_MISSION_ROWS,
  guestMissionFilterCounts,
} from "@/lib/missions-guest-data";
import type { MissionFilter } from "@/lib/missions-types";
import { getPointsLevel } from "@/lib/points-levels";
import { parsePointsHubTab, pointsHubHref, type PointsHubTab } from "@/lib/points-hub-tabs";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

type MissionsGuestPanelProps = {
  onSignIn: () => void;
};

function GuestSignInFooter({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="missions-sign-in-banner missions-sign-in-banner--footer">
      <div className="missions-sign-in-banner__copy">
        <p className="missions-sign-in-banner__title">Sign in to track Pump Points</p>
        <p className="missions-sign-in-banner__desc">
          Earn points for trades, launches, and milestones — then climb levels and unlock Market
          rewards.
        </p>
      </div>
      <button type="button" onClick={onSignIn} className="primary-button missions-sign-in-banner__cta">
        Sign in
      </button>
    </div>
  );
}

export function MissionsGuestPanel({ onSignIn }: MissionsGuestPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<MissionFilter>("open");
  const filterCounts = guestMissionFilterCounts();
  const level = useMemo(() => getPointsLevel(0), []);
  const activeTab = parsePointsHubTab(searchParams.get("tab"));

  const setActiveTab = useCallback(
    (tab: PointsHubTab) => {
      router.replace(pointsHubHref(tab), { scroll: false });
    },
    [router]
  );

  const pointsToEarn = GUEST_MISSION_ROWS.reduce((sum, m) => sum + m.rewardPoints, 0);
  const openMissions = GUEST_MISSION_ROWS.filter((m) => !m.completed);
  const boardMissions = GUEST_MISSION_ROWS.filter((mission) =>
    activeFilter === "done" ? mission.completed : !mission.completed
  );

  return (
    <div className="missions-page">
      <HubDiscoveryScrollLock />
      <div className="missions-hub points-hub">
        <div className="points-hub__layout">
          <aside className="points-hub__rail">
            <PointsStatusCard
              variant="rail"
              guestMode
              level={level}
              spendablePoints={0}
              pointsToEarn={pointsToEarn}
              completedCount={0}
              totalCount={GUEST_MISSION_ROWS.length}
              openCount={GUEST_MISSION_ROWS.length}
              tradingVolumeBnb={0}
            />
            <div className="points-hub__rail-ladder hidden md:block">
              <PointsLevelLadder level={level} guestMode compact />
            </div>
          </aside>

          <div className="points-hub__main">
            <div className="points-hub__status-mobile md:hidden">
              <PointsStatusCard
                guestMode
                level={level}
                spendablePoints={0}
                pointsToEarn={pointsToEarn}
                completedCount={0}
                totalCount={GUEST_MISSION_ROWS.length}
                openCount={GUEST_MISSION_ROWS.length}
                tradingVolumeBnb={0}
              />
            </div>

            <PointsHubTabs
              activeTab={activeTab}
              onSelect={setActiveTab}
              showRefresh
              onRefresh={onSignIn}
            />

            <div className="points-hub__body">
              <PointsHubBody
                tab={activeTab}
                level={level}
                spendablePoints={0}
                address=""
                openMissions={openMissions}
                boardMissions={boardMissions}
                activeFilter={activeFilter}
                filterCounts={filterCounts}
                loading={false}
                guestMode
                onSelectFilter={setActiveFilter}
                onRefresh={onSignIn}
                onSelectTab={setActiveTab}
                footerSlot={<GuestSignInFooter onSignIn={onSignIn} />}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
