import { Skeleton } from "@/components/ui/Skeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";
import { REWARDS_HUB } from "@/lib/rewards-copy";

type MissionsPanelSkeletonProps = {
  /** Route loading.tsx — fewer rows, less layout thrash. */
  compact?: boolean;
};

export function MissionsPanelSkeleton({ compact = false }: MissionsPanelSkeletonProps) {
  const rowCount = compact ? 3 : 5;

  return (
    <div className="missions-page" aria-busy="true" aria-label={`Loading ${REWARDS_HUB.navLabel}`}>
      <HubDiscoveryScrollLock />
      <div className="missions-hub points-hub">
        <div className="points-hub__layout">
          <div className="points-hub__status">
            <div className="points-status">
              <div className="points-status__header">
                <Skeleton variant="line" className="h-3 w-24" />
                <Skeleton variant="line" className="h-3 w-16" />
              </div>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-1 w-full rounded-full" />
              {!compact ? <Skeleton variant="line" className="h-3 w-36" /> : null}
            </div>
          </div>

          <div className="points-hub-tabs">
            <div className="flex gap-2 px-3 py-2">
              <Skeleton className="h-9 w-20 rounded-md" />
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
                      <div className="missions-list__primary">
                        <div className="space-y-1 min-w-0 flex-1">
                          <Skeleton className="h-4 w-36 max-w-full" />
                        </div>
                        <div className="missions-list__trail">
                          <Skeleton variant="line" className="h-4 w-12" />
                          <Skeleton variant="line" className="h-7 w-14" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
