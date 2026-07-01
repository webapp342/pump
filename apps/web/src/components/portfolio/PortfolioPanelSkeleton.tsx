import { Skeleton } from "@/components/ui/Skeleton";

export function PortfolioPanelSkeleton() {
  return (
    <div className="portfolio-page" aria-busy="true" aria-label="Loading portfolio">
      <div className="portfolio-hub">
        <header className="portfolio-hub-hero">
          <div className="token-detail-toolbar">
            <div className="token-detail-toolbar__row">
              <div className="token-detail-toolbar__identity">
                <Skeleton variant="circle" className="token-detail-toolbar__logo h-7 w-7" />
                <div className="space-y-1">
                  <Skeleton variant="line" className="h-3 w-14" />
                  <Skeleton variant="line" className="h-5 w-20" />
                  <Skeleton variant="line" className="h-3 w-24" />
                  <Skeleton variant="line" className="h-3 w-32" />
                </div>
              </div>
              <div className="token-detail-toolbar__scroll">
                <div className="token-detail-toolbar__stats">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="space-y-1">
                      <Skeleton variant="line" className="h-3 w-14" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        <nav className="portfolio-tab-nav" aria-hidden>
          <div className="portfolio-tab-nav__track">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} variant="line" className="mx-2 h-10 w-16 shrink-0" />
            ))}
          </div>
        </nav>

        <div className="portfolio-hub__body">
          <section className="overflow-hidden">
            <div className="sheet-list">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1.75rem_1fr_auto] gap-x-2 gap-y-2 border-b border-pump-border/10 p-2.5 md:p-3"
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
      </div>
    </div>
  );
}
