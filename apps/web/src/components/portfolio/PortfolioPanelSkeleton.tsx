import { Skeleton } from "@/components/ui/Skeleton";

export function PortfolioPanelSkeleton() {
  return (
    <div className="portfolio-page" aria-busy="true" aria-label="Loading portfolio">
      <div className="portfolio-hub">
        <header className="portfolio-header">
          <div className="portfolio-page-head">
            <Skeleton variant="line" className="h-7 w-24" />
          </div>
          <div className="portfolio-toolbar">
            <div className="portfolio-toolbar__shell">
              <div className="portfolio-toolbar__identity-row">
                <div className="portfolio-toolbar__identity">
                  <Skeleton variant="circle" className="h-8 w-8 shrink-0" />
                  <div className="space-y-1">
                    <Skeleton variant="line" className="h-4 w-24" />
                    <Skeleton variant="line" className="h-3 w-32" />
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <Skeleton variant="line" className="ml-auto h-3 w-14" />
                  <Skeleton className="ml-auto h-5 w-16" />
                </div>
              </div>
              <div className="portfolio-toolbar__divider" aria-hidden />
              <div className="portfolio-toolbar__pnl-row">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-1">
                    <Skeleton variant="line" className="h-3 w-14" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
              <div className="portfolio-toolbar__actions-row">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} variant="line" className="h-9 w-full" />
                ))}
              </div>
            </div>
          </div>
        </header>

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
