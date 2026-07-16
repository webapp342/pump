import { Skeleton } from "@/components/ui/Skeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

type MissionsPanelSkeletonProps = {
  /** Route loading.tsx — fewer rows, less layout thrash. */
  compact?: boolean;
};

export function MissionsPanelSkeleton({ compact = false }: MissionsPanelSkeletonProps) {
  const rowCount = compact ? 3 : 5;

  return (
    <div className="missions-page" aria-busy="true" aria-label="Loading Pump Points">
      <HubDiscoveryScrollLock />
      <div className="missions-hub points-hub">
        <div className="points-hub__layout">
          <div className="points-hub__main">
            <div className="points-hub__status-mobile">
              <div className="points-status panel-surface space-y-3 p-4">
                <Skeleton variant="line" className="h-3 w-24" />
                <Skeleton className="h-8 w-20" />
                {!compact ? <Skeleton variant="line" className="h-3 w-36" /> : null}
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            </div>

            <div className="points-hub-tabs">
              <div className="flex gap-2 px-3 py-2">
                <Skeleton className="h-9 w-20 rounded-md" />
                <Skeleton className="h-9 w-16 rounded-md" />
                <Skeleton className="h-9 w-16 rounded-md" />
                <Skeleton className="h-9 w-16 rounded-md" />
              </div>
            </div>

            <div className="points-hub__body">
              <section className="missions-list">
                <div className="missions-list__scroll">
                  <div className="missions-list__body">
                    {Array.from({ length: rowCount }).map((_, index) => (
                      <div key={index} className="missions-list__row missions-list__row--skeleton">
                        <div className="flex items-start gap-2">
                          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-36 max-w-full" />
                            <Skeleton variant="line" className="h-3 w-12" />
                          </div>
                        </div>
                        <Skeleton className="hidden h-1.5 w-full max-w-[8rem] rounded-full md:block" />
                        <Skeleton variant="line" className="ml-auto h-4 w-12" />
                        <Skeleton variant="line" className="ml-auto h-8 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
