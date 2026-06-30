import { Skeleton } from "@/components/ui/Skeleton";

export function PortfolioPanelSkeleton() {
  return (
    <div className="portfolio-hub space-y-3 md:space-y-4" aria-busy="true" aria-label="Loading portfolio">
      <section className="portfolio-hub-hero panel-surface">
        <div className="portfolio-hub-hero__profile">
          <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex gap-3">
              <Skeleton variant="line" className="h-3 w-20" />
              <Skeleton variant="line" className="h-3 w-20" />
            </div>
          </div>
        </div>

        <div className="portfolio-hub-hero__value-block space-y-2">
          <Skeleton variant="line" className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
          <Skeleton variant="line" className="h-4 w-28" />
        </div>

        <div className="portfolio-hub-hero__stats">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-1">
              <Skeleton variant="line" className="h-3 w-14" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>

        <div className="portfolio-hub-hero__actions">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </section>

      <div className="portfolio-tab-nav">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-9 flex-1 rounded-md" />
        ))}
      </div>

      <section className="panel-surface overflow-hidden">
        <div className="sheet-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[1.75rem_1fr_auto] gap-x-2 gap-y-2 p-2.5 md:p-3"
            >
              <Skeleton variant="circle" className="row-span-2 h-7 w-7 self-start" />
              <Skeleton className="h-4 w-20 self-center" />
              <Skeleton variant="line" className="h-4 w-14 self-center" />
              <div className="col-span-2 col-start-2 flex justify-between gap-2">
                <Skeleton variant="line" className="h-3 w-16" />
                <Skeleton variant="line" className="h-3 w-14" />
                <Skeleton variant="line" className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
