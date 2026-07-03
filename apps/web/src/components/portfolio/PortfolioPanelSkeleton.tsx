import { Skeleton } from "@/components/ui/Skeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

export function PortfolioPanelSkeleton() {
  return (
    <div className="portfolio-page" aria-busy="true" aria-label="Loading portfolio">
      <HubDiscoveryScrollLock />
      <div className="portfolio-hub">
        <header className="portfolio-header">
          <div className="portfolio-toolbar">
            <div className="portfolio-toolbar__shell">
              <div className="portfolio-toolbar__lead">
                <Skeleton variant="circle" className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton variant="line" className="h-4 w-28" />
                      <Skeleton variant="line" className="h-3 w-20" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton variant="circle" className="h-4 w-4" />
                      <Skeleton variant="circle" className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Skeleton variant="line" className="h-3 w-16" />
                    <Skeleton variant="line" className="h-3 w-16" />
                    <Skeleton variant="line" className="h-3 w-12" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="portfolio-summary-strip" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={`portfolio-summary-strip__cell${index === 2 ? " portfolio-summary-strip__cell--coins" : ""}`}
            >
              <Skeleton variant="line" className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton variant="line" className="h-3 w-24" />
            </div>
          ))}
        </div>

        <nav className="portfolio-tab-nav" aria-hidden>
          <div className="portfolio-tab-nav__track">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} variant="line" className="mx-1.5 h-9 w-14 shrink-0" />
            ))}
          </div>
        </nav>

        <div className="portfolio-hub__body">
          <section className="overflow-hidden">
            <div className="portfolio-holdings-mobile lg:hidden">
              <div className="portfolio-holdings-mobile__header">
                <Skeleton variant="line" className="h-3 w-8" />
                <Skeleton variant="line" className="ml-auto h-3 w-12" />
                <Skeleton variant="line" className="ml-auto h-3 w-10" />
              </div>
              <div className="portfolio-holdings-mobile__body">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="portfolio-holding-mobile">
                    <div className="portfolio-holding-mobile__coin">
                      <Skeleton variant="circle" className="h-7 w-7" />
                      <Skeleton className="h-4 w-14" />
                    </div>
                    <Skeleton variant="line" className="ml-auto h-3 w-12" />
                    <Skeleton variant="line" className="ml-auto h-3 w-12" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
