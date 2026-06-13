import { Skeleton } from "@/components/ui/Skeleton";

export function MissionsPanelSkeleton() {
  return (
    <div className="space-y-3 md:space-y-4">
      <div className="rounded-lg border border-pump-border/15 bg-pump-card/80 p-3 md:p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="mt-3 h-4 w-48" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>

      <div className="divide-y divide-pump-border/10 rounded-lg border border-pump-border/15">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex gap-3 px-3 py-3 md:px-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-sm" />
            </div>
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
