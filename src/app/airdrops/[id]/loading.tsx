import { AppShell } from "@/components/layout/AppShell";
import { AirdropDetailSkeleton } from "@/components/airdrops/AirdropsSkeleton";

export default function Loading() {
  return (
    <AppShell>
      <AirdropDetailSkeleton />
    </AppShell>
  );
}
