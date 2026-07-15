import { Skeleton } from "@/components/ui/Skeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

type MissionsPanelSkeletonProps = {
  /** Route loading.tsx — fewer rows, less layout thrash. */
  compact?: boolean;
};

export function MissionsPanelSkeleton({ compact = false }: MissionsPanelSkeletonProps) {
  const rowCount = compact ? 3 : 5;

  return (
    <div className="missions-page" aria-busy="true" aria-label="Loading missions">
      <HubDiscoveryScrollLock />
      <div className="missions-hub">
        <header className="missions-header">
          <div className="missions-toolbar">
            <div className="missions-toolbar__shell">
              <div className="missions-toolbar__hero-row">
                <div className="missions-toolbar__points-block space-y-2">
                  <Skeleton variant="line" className="h-3 w-24" />
                  <Skeleton className="h-8 w-20" />
                  {!compact ? <Skeleton variant="line" className="h-3 w-28" /> : null}
                </div>
                <div className="missions-toolbar__stats-stack">
                  {Array.from({ length: compact ? 2 : 3 }).map((_, index) => (
                    <div key={index} className="missions-stat-row">
                      <Skeleton variant="line" className="missions-stat-row__label h-3 w-14" />
                      <Skeleton variant="line" className="missions-stat-row__value h-4 w-12" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="missions-filter-bar">
          <div className="flex gap-2 px-3">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
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
            <div className="missions-list__scroll">
              <div className="missions-list__body">
                {Array.from({ length: rowCount }).map((_, index) => (
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
