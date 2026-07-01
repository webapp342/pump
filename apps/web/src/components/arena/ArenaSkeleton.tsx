import {
  SkeletonArenaFilterChips,
  SkeletonArenaToolbar,
  SkeletonBoardTable,
  SkeletonMcapTicker,
} from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

export function ArenaSkeleton() {
  return (
    <div className="arena-page min-w-0" aria-busy="true" aria-label="Loading arena">
      <div className="arena-page__sticky">
        <SkeletonMcapTicker />
        <div className="arena-page__controls space-y-2 md:space-y-3">
          <Skeleton variant="line" className="h-3 w-28" />
          <SkeletonArenaToolbar />
          <SkeletonArenaFilterChips count={7} />
          <div className="arena-filter-bar-wrap md:hidden">
            <SkeletonArenaFilterChips count={5} />
          </div>
          <div className="arena-page__sort-row flex flex-wrap items-center gap-2">
            <Skeleton variant="line" className="h-8 w-36" />
            <Skeleton variant="line" className="h-8 w-44" />
          </div>
        </div>
      </div>
      <div className="arena-page__scroll">
        <SkeletonBoardTable rows={9} />
      </div>
    </div>
  );
}
