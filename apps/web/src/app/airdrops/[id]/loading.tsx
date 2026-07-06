import { AppShellFrame } from "@/components/layout/AppShell";
import { AirdropDetailSkeleton } from "@/components/airdrops/AirdropsSkeleton";

export default function Loading() {
  return (
    <AppShellFrame pathname="/airdrops">
      <AirdropDetailSkeleton />
    </AppShellFrame>
  );
}
