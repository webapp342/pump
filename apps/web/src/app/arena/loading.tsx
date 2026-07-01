import { AppShellFrame } from "@/components/layout/AppShell";
import { ArenaSkeleton } from "@/components/arena/ArenaSkeleton";

export default function ArenaLoading() {
  return (
    <AppShellFrame pathname="/arena">
      <ArenaSkeleton />
    </AppShellFrame>
  );
}
