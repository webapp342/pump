import { SkeletonArenaFilterChips } from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

export function MissionsPanelSkeleton() {
  return (
    <div className="space-y-3 md:space-y-4" aria-busy="true" aria-label="Loading missions">
      <section className="panel-surface p-4 md:p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton variant="line" className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="space-y-1.5 text-right">
            <Skeleton variant="line" className="ml-auto h-3 w-24" />
            <Skeleton variant="line" className="ml-auto h-3 w-20" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Skeleton variant="line" className="h-3 w-28" />
          <Skeleton variant="line" className="h-3 w-32" />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SkeletonArenaFilterChips count={3} />
        <Skeleton variant="line" className="h-3 w-24" />
      </div>

      <section className="panel-surface overflow-hidden">
        <div className="sheet-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex gap-3 px-3 py-3 md:px-4 md:py-3.5">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton variant="line" className="h-3 w-full max-w-sm" />
                <Skeleton className="h-1.5 w-full max-w-xs rounded-full" />
              </div>
              <Skeleton className="h-8 w-14 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
