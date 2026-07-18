import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { KolMarketPanel } from "@/components/kol-market/KolMarketPanel";
import { Skeleton } from "@/components/ui/Skeleton";

function KolMarketSkeleton() {
  return (
    <div className="kol-market-page">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-4 h-24 w-full" />
      <Skeleton className="mt-6 h-64 w-full" />
    </div>
  );
}

export default function KolMarketPage() {
  return (
    <AppShell>
      <Suspense fallback={<KolMarketSkeleton />}>
        <KolMarketPanel />
      </Suspense>
    </AppShell>
  );
}
