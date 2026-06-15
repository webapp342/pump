import { Skeleton } from "@/components/ui/Skeleton";

export function AirdropsSkeleton() {
  return (
    <div className="space-y-3 md:space-y-4">
      <div className="space-y-2 md:space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full rounded-lg md:h-32" />
        <Skeleton className="h-8 w-full max-w-md" />
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.5rem] w-full rounded-lg md:h-16" />
        ))}
      </div>

      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="hidden h-9 w-28 rounded-md md:block" />
        </div>
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md md:hidden" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function AirdropDetailSkeleton() {
  return (
    <div className="min-w-0 space-y-4 md:space-y-5">
      <div className="panel-surface overflow-hidden">
        <div className="border-b border-pump-border/15 p-4 md:px-5 md:py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full md:h-14 md:w-14" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-3.5 w-36" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 md:p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[5fr_7fr]">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
