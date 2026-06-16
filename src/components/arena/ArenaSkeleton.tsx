import {
  SkeletonArenaFilterChips,
  SkeletonArenaToolbar,
  SkeletonBoardTable,
  SkeletonHighlightCards,
  SkeletonKothBanner,
  SkeletonMcapTicker,
} from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

export function ArenaSkeleton() {
  return (
    <div className="min-w-0 space-y-3 md:space-y-4" aria-busy="true" aria-label="Loading arena">
      <SkeletonMcapTicker />
      <SkeletonKothBanner />
      <SkeletonHighlightCards />

      <div className="space-y-2 md:space-y-3">
        <Skeleton variant="line" className="h-3 w-28" />

        <SkeletonArenaToolbar />

        <SkeletonArenaFilterChips count={7} />

        <div className="arena-filter-bar-wrap md:hidden">
          <SkeletonArenaFilterChips count={5} />
        </div>

        <SkeletonBoardTable rows={9} />
      </div>
    </div>
  );
}
