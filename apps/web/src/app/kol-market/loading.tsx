import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

export default function KolMarketLoading() {
  return (
    <AppShell>
      <div className="kol-market-page">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-24 w-full" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    </AppShell>
  );
}
