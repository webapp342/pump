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
            <div className="arena-filter-bar__mobile-head md:hidden">
              <div className="arena-filter-bar__mobile-tools">
                <Skeleton className="h-[2.375rem] w-[2.375rem] shrink-0 rounded-md" />
              </div>
              <div className="arena-filter-bar__tabs-row arena-filter-bar__tabs-row--mobile flex min-w-0 flex-1 gap-2 overflow-hidden">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-16 shrink-0 rounded-none" />
                ))}
              </div>
            </div>
            <div className="arena-filter-bar__mobile-search md:hidden">
              <Skeleton className="h-[2.125rem] w-full rounded-sm" />
            </div>
            <div className="arena-filter-bar__main hidden md:flex">
              <div className="arena-filter-bar__search-row">
                <div className="arena-filter-bar__search">
                  <Skeleton className="h-8 w-full min-w-[7.5rem] rounded-sm" />
                </div>
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
        <div className="arena-mobile-list md:hidden">
          <SkeletonBoardTable rows={8} />
        </div>
        <div className="hidden md:block">
          <SkeletonBoardTable rows={9} />
        </div>
      </div>
    </div>
  );
}
