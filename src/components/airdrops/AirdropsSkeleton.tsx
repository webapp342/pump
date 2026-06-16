import { Skeleton } from "@/components/ui/Skeleton";
import {
  SkeletonArenaFilterChips,
  SkeletonArenaToolbar,
  SkeletonHighlightCards,
  SkeletonKothBanner,
} from "@/components/ui/skeleton-parts";

export function AirdropsSkeleton() {
  return (
    <div className="space-y-3 md:space-y-4" aria-busy="true" aria-label="Loading airdrops">
      <section className="space-y-2 md:space-y-3">
        <Skeleton variant="line" className="h-3 w-32" />
        <SkeletonKothBanner />
        <div className="scroll-strip-row">
          <Skeleton variant="line" className="h-3 w-14 shrink-0" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-20 shrink-0 rounded-full" />
            ))}
          </div>
        </div>
      </section>

      <SkeletonHighlightCards />

      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton variant="line" className="h-3 w-32" />
          <Skeleton className="hidden h-9 w-28 rounded-md md:block" />
        </div>

        <SkeletonArenaToolbar withViewToggle={false} />
        <SkeletonArenaFilterChips count={8} />
        <div className="arena-filter-bar-wrap md:hidden">
          <SkeletonArenaFilterChips count={6} />
        </div>

        <section className="panel-surface overflow-hidden">
          <div className="sheet-list">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="p-3 md:p-4">
                <div className="flex items-start gap-3">
                  <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton variant="line" className="h-3 w-28" />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {Array.from({ length: 4 }).map((_, chipIndex) => (
                        <Skeleton key={chipIndex} variant="line" className="h-3 w-16" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function AirdropDetailSkeleton() {
  return (
    <div className="min-w-0 space-y-4 md:space-y-5" aria-busy="true" aria-label="Loading airdrop">
      <div className="panel-surface overflow-hidden">
        <div className="border-b border-pump-border/15 p-4 md:px-5 md:py-4">
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" className="h-12 w-12 shrink-0 md:h-14 md:w-14" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton variant="line" className="h-4 w-full max-w-md" />
              <Skeleton variant="line" className="h-3.5 w-36" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 md:p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton variant="line" className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[5fr_7fr]">
        <div className="panel-surface p-4">
          <Skeleton variant="line" className="h-3 w-24" />
          <Skeleton className="mt-4 h-10 w-full rounded-md" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </div>
        <section className="panel-surface overflow-hidden">
          <div className="border-b border-pump-border/15 px-4 py-3">
            <Skeleton variant="line" className="h-3 w-28" />
          </div>
          <div className="sheet-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Skeleton variant="circle" className="h-6 w-6" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton variant="line" className="h-3 w-14" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
