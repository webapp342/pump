import { Skeleton } from "@/components/ui/Skeleton";
import { AppShell } from "@/components/layout/AppShell";
import { PageIntroSkeleton } from "@/components/ui/PageIntroSkeleton";

function AdminPanelSkeleton() {
  return (
    <div className="admin-page space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-pump-border/30 pb-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-md" />
        ))}
      </div>
      <div className="panel-surface space-y-4 p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3 border-b border-pump-border/15 pb-3 last:border-0 last:pb-0">
            <Skeleton className="h-4 w-32" />
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
      <PageIntroSkeleton />
      <AdminPanelSkeleton />
    </AppShell>
  );
}
