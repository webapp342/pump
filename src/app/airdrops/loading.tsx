import { AppShell } from "@/components/layout/AppShell";
import { AirdropsSkeleton } from "@/components/airdrops/AirdropsSkeleton";

export default function Loading() {
  return (
    <AppShell>
      <AirdropsSkeleton />
    </AppShell>
  );
}
