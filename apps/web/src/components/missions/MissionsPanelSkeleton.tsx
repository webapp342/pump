import { Skeleton } from "@/components/ui/Skeleton";

export function MissionsPanelSkeleton() {
  return (
    <div className="missions-page" aria-busy="true" aria-label="Loading missions">
      <div className="missions-hub">
        <header className="missions-header">
          <div className="missions-page-head">
            <Skeleton variant="line" className="h-7 w-28" />
          </div>
          <div className="missions-toolbar">
            <div className="missions-toolbar__shell">
              <div className="missions-toolbar__hero-row">
                <div className="space-y-2">
                  <Skeleton variant="line" className="h-3 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton variant="line" className="h-3 w-28" />
                </div>
              </div>
              <div className="missions-toolbar__divider" aria-hidden />
              <div className="missions-toolbar__stats-row">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-1">
                    <Skeleton variant="line" className="h-3 w-14" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="missions-filter-bar">
          <div className="flex gap-2 px-3">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-16 rounded-md" />
            <Skeleton className="h-9 w-16 rounded-md" />
          </div>
          <Skeleton variant="line" className="mr-3 h-8 w-16" />
        </div>

        <div className="missions-body">
          <section className="missions-list">
            <div className="missions-list__head missions-list__head--skeleton" aria-hidden>
              <Skeleton variant="line" className="h-3 w-14" />
              <Skeleton variant="line" className="h-3 w-16" />
              <Skeleton variant="line" className="ml-auto h-3 w-10" />
              <Skeleton variant="line" className="ml-auto h-3 w-10" />
            </div>
            <div className="missions-list__body">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="missions-list__row missions-list__row--skeleton">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-36 max-w-full" />
                    <Skeleton variant="line" className="h-3 w-12" />
                  </div>
                  <Skeleton className="hidden h-1.5 w-full max-w-[8rem] rounded-full md:block" />
                  <Skeleton variant="line" className="ml-auto h-4 w-10" />
                  <Skeleton variant="line" className="ml-auto h-8 w-16" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
