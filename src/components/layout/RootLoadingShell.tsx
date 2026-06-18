import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/** Fallback while RootProviders awaits headers() — avoids hard-refresh blank flash. */
export function RootLoadingShell() {
  return (
    <AppShell>
      <div className="min-w-0 space-y-4" aria-busy="true" aria-label="Loading application">
        <Skeleton variant="line" className="h-6 w-40" />
        <Skeleton variant="block" className="h-48 w-full" />
        <Skeleton variant="block" className="h-32 w-full" />
      </div>
    </AppShell>
  );
}
