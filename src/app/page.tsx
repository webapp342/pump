import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ArenaHomeServer } from "@/components/arena/ArenaHomeServer";
import { ArenaSkeleton } from "@/components/arena/ArenaSkeleton";

export default function HomePage() {
  return (
    <AppShell>
      <Suspense fallback={<ArenaSkeleton />}>
        <ArenaHomeServer />
      </Suspense>
    </AppShell>
  );
}
