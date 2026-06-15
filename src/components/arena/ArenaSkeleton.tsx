import { Skeleton } from "@/components/ui/Skeleton";

function BoardRowSkeleton() {
  return (
    <div className="grid grid-cols-[0.875rem_1.75rem_1fr_auto] gap-x-2 gap-y-2 p-2.5 md:p-3">
      <Skeleton className="h-3 w-3 self-center" />
      <Skeleton className="h-7 w-7 rounded-full" />
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-14 self-center" />
    </div>
  );
}

export function ArenaSkeleton() {
  return (
    <div className="space-y-4 md:space-y-5">
      <section className="grid grid-cols-3 gap-2 md:gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="panel-surface p-2.5 md:p-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-4 w-20" />
          </div>
        ))}
      </section>

      <div className="panel-surface p-3 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
        <div className="arena-filter-bar-wrap mt-3">
          <div className="arena-filter-bar">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-20 shrink-0 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      <section className="panel-surface overflow-hidden">
        <div className="sheet-list">
          {Array.from({ length: 8 }).map((_, index) => (
            <BoardRowSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
