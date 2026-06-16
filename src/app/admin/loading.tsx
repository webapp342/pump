import { SkeletonPageIntro } from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";
import { AppShell } from "@/components/layout/AppShell";

function AdminPanelSkeleton() {
  return (
    <div className="admin-page space-y-4" aria-busy="true" aria-label="Loading admin">
      <div className="flex flex-wrap gap-2 border-b border-pump-border/30 pb-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-md" />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="panel-surface p-4">
            <Skeleton variant="line" className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="panel-surface space-y-0 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-3 border-b border-pump-border/15 px-4 py-3 last:border-0"
          >
            <Skeleton variant="line" className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <AppShell>
      <SkeletonPageIntro />
      <AdminPanelSkeleton />
    </AppShell>
  );
}
