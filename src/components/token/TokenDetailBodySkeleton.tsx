import { AppShell } from "@/components/layout/AppShell";
import {
  SkeletonChartPanel,
  SkeletonTradePanel,
} from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

export function TokenDetailBodySkeleton() {
  return (
    <div
      className="mt-3 space-y-5 pb-[var(--mobile-token-footer-height)] md:mt-4 md:space-y-6 lg:pb-0"
      aria-busy="true"
      aria-label="Loading token"
    >
      <header className="lg:hidden">
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton variant="line" className="h-3 w-40" />
          </div>
          <div className="flex shrink-0 gap-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-8 rounded-md" />
            ))}
          </div>
        </div>
      </header>

      <header className="hidden lg:flex lg:items-start lg:justify-between lg:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Skeleton variant="circle" className="h-12 w-12 shrink-0" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-6 w-48 max-w-full" />
            <Skeleton variant="line" className="h-3 w-56 max-w-full" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-10 rounded-md" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <SkeletonChartPanel />

          <div className="space-y-3 pt-1">
            <Skeleton variant="line" className="h-3 w-20" />
            <section className="panel-surface overflow-hidden">
              <div className="sheet-list">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 md:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton variant="circle" className="h-6 w-6" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton variant="line" className="h-3 w-16" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="hidden min-w-0 w-full space-y-5 lg:block">
          <SkeletonTradePanel />
          <div className="panel-surface p-4">
            <Skeleton variant="line" className="h-3 w-28" />
            <div className="mt-3 flex items-center gap-3">
              <Skeleton variant="circle" className="h-9 w-9" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="mt-4 h-8 w-full rounded-md" />
          </div>
        </aside>
      </div>

      <div
        className="token-trade-dock fixed inset-x-0 bottom-0 z-40 border-t border-pump-border/20 bg-pump-surface/95 backdrop-blur lg:hidden"
        aria-hidden
      >
        <div className="grid grid-cols-2 gap-2 p-3">
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
        </div>
      </div>
    </div>
  );
}
