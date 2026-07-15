import { AppShell } from "@/components/layout/AppShell";
import { MissionsPanelSkeleton } from "@/components/missions/MissionsPanelSkeleton";

/** Light chrome-only placeholder — panel keeps soft refresh after first paint. */
export default function Loading() {
  return (
    <AppShell>
      <MissionsPanelSkeleton compact />
    </AppShell>
  );
}
