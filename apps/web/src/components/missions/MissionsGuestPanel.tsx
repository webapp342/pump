"use client";

import { useState } from "react";
import { MissionsHero } from "@/components/missions/MissionsHero";
import { MissionsFilterNav } from "@/components/missions/MissionsFilterNav";
import { MissionsList } from "@/components/missions/MissionList";
import {
  GUEST_MISSION_ROWS,
  guestMissionFilterCounts,
} from "@/lib/missions-guest-data";
import type { MissionFilter } from "@/lib/missions-types";

type MissionsGuestPanelProps = {
  onSignIn: () => void;
};

function GuestSignInFooter({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="missions-sign-in-banner missions-sign-in-banner--footer">
      <div className="missions-sign-in-banner__copy">
        <p className="missions-sign-in-banner__title">Sign in to track missions</p>
        <p className="missions-sign-in-banner__desc">
          Earn Pump Points for trades, launches, and milestones after you sign in.
        </p>
      </div>
      <button type="button" onClick={onSignIn} className="primary-button missions-sign-in-banner__cta">
        Sign in
      </button>
    </div>
  );
}

export function MissionsGuestPanel({ onSignIn }: MissionsGuestPanelProps) {
  const [activeFilter, setActiveFilter] = useState<MissionFilter>("open");
  const filterCounts = guestMissionFilterCounts();

  const previewMissions = GUEST_MISSION_ROWS.filter((mission) => {
    if (activeFilter === "open") return !mission.completed;
    if (activeFilter === "done") return mission.completed;
    return true;
  });

  return (
    <div className="missions-page">
      <div className="missions-hub">
        <MissionsHero
          guestMode
          totalPoints={0}
          pointsToEarn={GUEST_MISSION_ROWS.reduce((sum, m) => sum + m.rewardPoints, 0)}
          completedCount={0}
          totalCount={GUEST_MISSION_ROWS.length}
          openCount={GUEST_MISSION_ROWS.length}
          tradingVolumeBnb={0}
        />

        <MissionsFilterNav
          activeFilter={activeFilter}
          filterCounts={filterCounts}
          loading={false}
          onSelect={setActiveFilter}
          onRefresh={onSignIn}
        />

        <div className="missions-body">
          <MissionsList missions={previewMissions} guestMode />
          <GuestSignInFooter onSignIn={onSignIn} />
        </div>
      </div>
    </div>
  );
}
