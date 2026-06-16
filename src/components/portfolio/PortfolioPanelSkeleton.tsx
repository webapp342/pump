import { Skeleton } from "@/components/ui/Skeleton";

export function PortfolioPanelSkeleton() {
  return (
    <div className="space-y-3 md:space-y-4" aria-busy="true" aria-label="Loading portfolio">
      <section className="panel-surface overflow-hidden bg-gradient-to-br from-pump-accent/10 via-pump-card to-pump-surface/60 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" className="h-12 w-12 shrink-0 md:h-14 md:w-14" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex gap-3">
              <Skeleton variant="line" className="h-3 w-20" />
              <Skeleton variant="line" className="h-3 w-20" />
            </div>
          </div>
        </div>

        <div className="portfolio-hero-metrics mt-3 grid grid-cols-2 items-stretch gap-2 md:mt-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel-surface min-h-[4.5rem] p-3">
              <Skeleton variant="line" className="h-3 w-20" />
              <Skeleton className="mt-2 h-5 w-24" />
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-2 md:space-y-3">
        <Skeleton variant="line" className="h-4 w-32" />
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

      <div className="space-y-2 md:space-y-3">
        <Skeleton variant="line" className="h-4 w-36" />
        <section className="panel-surface p-4">
          <Skeleton variant="line" className="h-3 w-40" />
          <Skeleton className="mt-3 h-9 w-full max-w-xs rounded-md" />
        </section>
      </div>
    </div>
  );
}
