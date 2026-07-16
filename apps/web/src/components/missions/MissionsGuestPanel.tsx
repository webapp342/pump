"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PointsHubBody } from "@/components/missions/PointsHubBody";
import { PointsHubTabs } from "@/components/missions/PointsHubTabs";
import { PointsStatusCard } from "@/components/missions/PointsStatusCard";
import {
  GUEST_MISSION_ROWS,
  guestMissionFilterCounts,
} from "@/lib/missions-guest-data";
import type { MissionFilter } from "@/lib/missions-types";
import { getPointsLevel } from "@/lib/points-levels";
import {
  parsePointsHubTab,
  parsePointsMarketView,
  pointsHubHref,
  type PointsHubTab,
  type PointsMarketView,
} from "@/lib/points-hub-tabs";
import { REWARDS_GUEST } from "@/lib/rewards-copy";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

type MissionsGuestPanelProps = {
  onSignIn: () => void;
};

function GuestSignInFooter({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="missions-sign-in-banner missions-sign-in-banner--footer">
      <div className="missions-sign-in-banner__copy">
        <p className="missions-sign-in-banner__title">{REWARDS_GUEST.title}</p>
        <p className="missions-sign-in-banner__desc">{REWARDS_GUEST.description}</p>
      </div>
      <button type="button" onClick={onSignIn} className="primary-button missions-sign-in-banner__cta">
        {REWARDS_GUEST.cta}
      </button>
    </div>
  );
}

export function MissionsGuestPanel({ onSignIn }: MissionsGuestPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<MissionFilter>("open");
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const filterCounts = guestMissionFilterCounts();
  const level = useMemo(() => getPointsLevel(0), []);
  const rawTab = searchParams.get("tab");
  const activeTab = parsePointsHubTab(rawTab);
  const marketView: PointsMarketView =
    rawTab === "activity" ? "inventory" : parsePointsMarketView(searchParams.get("market"));

  const setActiveTab = useCallback(
    (tab: PointsHubTab) => {
      router.replace(pointsHubHref(tab), { scroll: false });
    },
    [router]
  );

  const setMarketView = useCallback(
    (view: PointsMarketView) => {
      router.replace(pointsHubHref("market", view), { scroll: false });
    },
    [router]
  );

  const boardMissions = GUEST_MISSION_ROWS.filter((mission) =>
    activeFilter === "done" ? mission.completed : !mission.completed
  );

  return (
    <div className="missions-page">
      <HubDiscoveryScrollLock />
      <div className="missions-hub points-hub">
        <div className="points-hub__layout">
          <div className="points-hub__status">
            <PointsStatusCard guestMode level={level} spendablePoints={0} />
          </div>

          <PointsHubTabs
            activeTab={activeTab}
            onSelect={setActiveTab}
            showRefresh={activeTab === "leaderboard"}
            onRefresh={() => {
              if (activeTab === "leaderboard") {
                setLeaderboardRefreshKey((key) => key + 1);
                return;
              }
              onSignIn();
            }}
          />

          <div className="points-hub__body">
            <PointsHubBody
              tab={activeTab}
              marketView={marketView}
              onSelectMarketView={setMarketView}
              level={level}
              spendablePoints={0}
              address=""
              boardMissions={boardMissions}
              activeFilter={activeFilter}
              filterCounts={filterCounts}
              loading={false}
              guestMode
              leaderboardRefreshKey={leaderboardRefreshKey}
              onSelectFilter={setActiveFilter}
              onRefresh={onSignIn}
              footerSlot={<GuestSignInFooter onSignIn={onSignIn} />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
