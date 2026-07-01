import { Skeleton } from "@/components/ui/Skeleton";

export function AirdropsSkeleton() {
  return (
    <div className="airdrops-page" aria-busy="true" aria-label="Loading airdrops">
      <div className="airdrops-hub">
        <header className="airdrops-header">
          <div className="airdrops-page-head">
            <Skeleton variant="line" className="h-7 w-28" />
          </div>
          <div className="airdrops-toolbar">
            <div className="airdrops-toolbar__shell">
              <div className="airdrops-toolbar__hero-row">
                <div className="space-y-2">
                  <Skeleton variant="line" className="h-3 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton variant="line" className="h-3 w-32" />
                </div>
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                      <Skeleton variant="line" className="h-3 w-14" />
                      <Skeleton variant="line" className="h-3 w-6" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="airdrops-filter-bar">
          <div className="airdrops-filter-bar__main">
            <div className="airdrops-filter-bar__search">
              <Skeleton className="h-9 w-full rounded-md md:h-[2.25rem] md:w-36" />
            </div>
            <div className="flex flex-1 gap-2 overflow-hidden px-1 md:px-0">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-20 shrink-0 rounded-md md:h-9" />
              ))}
            </div>
          </div>
          <Skeleton variant="line" className="mr-3 hidden h-8 w-16 sm:block" />
        </div>

        <section className="airdrops-list">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="airdrops-list__row airdrops-list__row--skeleton">
              <Skeleton variant="circle" className="h-7 w-7 shrink-0" />
              <Skeleton className="h-4 w-24" />
              <Skeleton variant="line" className="h-3 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export function AirdropDetailSkeleton() {
  return (
    <div className="min-w-0 space-y-4 md:space-y-5" aria-busy="true" aria-label="Loading airdrop">
      <div className="panel-surface overflow-hidden">
        <div className="border-b border-pump-border/15 p-4 md:px-5 md:py-4">
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" className="h-12 w-12 shrink-0 md:h-14 md:w-14" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton variant="line" className="h-4 w-full max-w-md" />
              <Skeleton variant="line" className="h-3.5 w-36" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 md:p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton variant="line" className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[5fr_7fr]">
        <div className="panel-surface p-4">
          <Skeleton variant="line" className="h-3 w-24" />
          <Skeleton className="mt-4 h-10 w-full rounded-md" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </div>
        <section className="panel-surface overflow-hidden">
          <div className="border-b border-pump-border/15 px-4 py-3">
            <Skeleton variant="line" className="h-3 w-28" />
          </div>
          <div className="sheet-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Skeleton variant="circle" className="h-6 w-6" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton variant="line" className="h-3 w-14" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
