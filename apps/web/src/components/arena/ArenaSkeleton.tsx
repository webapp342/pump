import { Skeleton } from "@/components/ui/Skeleton";
import { SkeletonBoardTable } from "@/components/ui/skeleton-parts";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

export function ArenaSkeleton() {
  return (
    <div className="arena-page min-w-0" aria-busy="true" aria-label="Loading arena">
      <HubDiscoveryScrollLock />
      <div className="arena-page__sticky">
        <div className="arena-hub">
          <div className="arena-filter-bar" aria-hidden>
            <div className="arena-filter-bar__main">
              <div className="arena-filter-bar__search-row">
                <div className="arena-filter-bar__search">
                  <Skeleton className="h-8 w-full min-w-[7.5rem] rounded-sm" />
                </div>
                <Skeleton className="h-8 w-24 shrink-0 rounded-md md:hidden" />
              </div>
              <div className="arena-tab-nav flex min-w-0 flex-1 gap-2 overflow-hidden">
                <Skeleton className="h-9 w-9 shrink-0 rounded-none" />
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-16 shrink-0 rounded-none" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="arena-page__scroll">
        <SkeletonBoardTable rows={9} />
      </div>
    </div>
  );
}
