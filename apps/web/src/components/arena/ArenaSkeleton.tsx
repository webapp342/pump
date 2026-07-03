import { Skeleton } from "@/components/ui/Skeleton";
import { SkeletonBoardTable } from "@/components/ui/skeleton-parts";

export function ArenaSkeleton() {
  return (
    <div className="arena-page min-w-0" aria-busy="true" aria-label="Loading arena">
      <div className="arena-page__sticky">
        <div className="arena-hub">
          <div className="arena-filter-bar" aria-hidden>
            <div className="arena-filter-bar__main">
              <div className="arena-filter-bar__search">
                <Skeleton className="h-8 w-full min-w-[7.5rem] rounded-sm" />
              </div>
              <div className="arena-tab-nav flex min-w-0 flex-1 gap-2 overflow-hidden">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-16 shrink-0 rounded-none" />
                ))}
              </div>
            </div>
            <Skeleton className="h-8 w-36 shrink-0 rounded-md" />
          </div>

          <div className="arena-options-bar arena-options-bar--mobile-only md:hidden" aria-hidden>
            <Skeleton className="h-8 w-28 shrink-0 rounded-md" />
          </div>
        </div>
      </div>
      <div className="arena-page__scroll">
        <SkeletonBoardTable rows={9} />
      </div>
    </div>
  );
}
