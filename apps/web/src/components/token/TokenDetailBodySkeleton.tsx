import {
  SkeletonChartPanel,
  SkeletonTradePanel,
} from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

export function TokenDetailBodySkeleton() {
  const toolbarSkeleton = (
    <div className="token-detail-toolbar panel-surface">
      <div className="token-detail-toolbar__row">
        <div className="token-detail-toolbar__identity">
          <Skeleton className="h-5 w-5 shrink-0 rounded-sm" />
          <Skeleton variant="circle" className="h-7 w-7 shrink-0" />
          <div className="token-detail-toolbar__pair-meta">
            <Skeleton className="h-5 w-24" />
            <Skeleton variant="line" className="h-3 w-14" />
          </div>
        </div>
        <div className="token-detail-toolbar__scroll">
          <div className="token-detail-toolbar__stats">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="token-detail-toolbar__stat">
                <Skeleton variant="line" className="h-3 w-14" />
                <Skeleton className="mt-1 h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="token-detail-toolbar__actions">
          <Skeleton className="h-5 w-5 shrink-0 rounded-sm" />
        </div>
      </div>
    </div>
  );

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
          <div className="token-page-chart-slot">
            <SkeletonChartPanel />
          </div>
          <div className="token-page-tape-slot">
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

        <aside className="token-page-stack token-page-stack--aside hidden lg:flex">
          <SkeletonTradePanel />
        </aside>
      </div>
    </div>
  );
}
