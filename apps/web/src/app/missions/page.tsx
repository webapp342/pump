import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MissionsPanel } from "@/components/missions/MissionsPanel";
import { MissionsPanelSkeleton } from "@/components/missions/MissionsPanelSkeleton";

export default function MissionsPage() {
  return (
    <AppShell>
      <Suspense fallback={<MissionsPanelSkeleton />}>
        <MissionsPanel />
      </Suspense>
    </AppShell>
  );
}
