import {
  SkeletonChartPanel,
  SkeletonTradePanel,
} from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

export function TokenDetailBodySkeleton() {
  const toolbarSkeleton = (
    <div className="token-detail-toolbar panel-surface">
      <div className="token-detail-toolbar__identity">
        <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36 max-w-full" />
          <Skeleton variant="line" className="h-3 w-48 max-w-full" />
        </div>
      </div>
      <div className="token-detail-toolbar__actions">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-8 rounded-md" />
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="token-page pb-[var(--mobile-token-footer-height)] lg:pb-0"
      aria-busy="true"
      aria-label="Loading token"
    >
      <div className="token-page-grid">
        <div className="token-page-stack token-page-stack--main">
          {toolbarSkeleton}
          <SkeletonChartPanel />
          <section className="panel-surface overflow-hidden">
            <div className="border-b border-pump-border/15 px-3 py-2">
              <Skeleton className="h-7 w-32 rounded-md" />
            </div>
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

        <aside className="token-page-stack token-page-stack--aside hidden lg:flex">
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
    </div>
  );
}
