import {
  SkeletonChartPanel,
  SkeletonTradePanel,
} from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

/** Compact placeholder — not a second navbar; matches token stats strip height only. */
function TokenToolbarSkeleton() {
  return (
    <div className="token-detail-toolbar-skeleton panel-surface" aria-hidden>
      <Skeleton className="token-detail-toolbar-skeleton__bar" />
    </div>
  );
}

export function TokenDetailBodySkeleton() {
  const toolbarSkeleton = <TokenToolbarSkeleton />;

  return (
    <div className="token-page" aria-busy="true" aria-label="Loading token">
      <div className="token-page-grid">
        <div className="token-page-toolbar-slot hidden lg:block">{toolbarSkeleton}</div>

        <div className="token-page-stack token-page-stack--sidebar hidden lg:flex">
          <section className="token-market-sidebar panel-surface">
            <div className="token-market-sidebar__toolbar">
              <Skeleton className="mb-2 h-8 w-full rounded-none" />
              <div className="token-market-sidebar__filter-strip">
                <Skeleton className="h-4 w-3 shrink-0 rounded-none" />
                <div className="flex min-w-0 gap-2 px-1">
                  <Skeleton className="h-4 w-10 shrink-0" />
                  <Skeleton className="h-4 w-8 shrink-0" />
                  <Skeleton className="h-4 w-12 shrink-0" />
                </div>
                <Skeleton className="h-4 w-3 shrink-0 rounded-none" />
              </div>
            </div>
            <div className="token-market-sidebar__head" aria-hidden>
              <Skeleton variant="line" className="h-3 w-14" />
              <Skeleton variant="line" className="ml-auto h-3 w-8" />
              <Skeleton variant="line" className="ml-auto h-3 w-8" />
              <Skeleton variant="line" className="ml-auto h-3 w-6" />
            </div>
            <div className="token-market-sidebar__list p-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="mb-2 h-8 w-full rounded-sm" />
              ))}
            </div>
          </section>
        </div>

        <div className="token-page-stack token-page-stack--main">
          <div className="shrink-0 lg:hidden">{toolbarSkeleton}</div>
          <div className="token-page-content-slot">
            <div className="token-page-chart-slot">
              <SkeletonChartPanel />
            </div>
            <div className="token-page-mobile-activity lg:hidden">
              <section className="panel-surface token-trade-tape flex min-h-0 flex-1 flex-col">
                <div className="flex gap-2 border-b border-pump-border/15 px-3 py-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div className="flex-1 space-y-2 overflow-hidden p-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-6 w-full" />
                  ))}
                </div>
              </section>
            </div>
            <div className="token-page-tape-slot hidden lg:flex">
              <section className="panel-surface flex h-full min-h-0 flex-col">
                <div className="flex gap-2 border-b border-pump-border/15 px-3 py-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <Skeleton key={index} className="h-6 w-full" />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>

        <aside className="token-page-stack token-page-stack--aside hidden lg:flex">
          <SkeletonTradePanel />
        </aside>
      </div>

      <div className="token-trade-dock token-trade-dock--footer lg:hidden" aria-hidden>
        <div className="token-trade-dock-inner">
          <div className="token-trade-dock-actions">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
