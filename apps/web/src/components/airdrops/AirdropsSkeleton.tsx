import { Skeleton } from "@/components/ui/Skeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

export function AirdropsSkeleton() {
  return (
    <div className="airdrops-page" aria-busy="true" aria-label="Loading airdrops">
      <HubDiscoveryScrollLock />
      <div className="airdrops-hub">
        <div className="airdrops-page__sticky">
          <div className="airdrops-filter-bar">
            <div className="airdrops-filter-bar__search-row">
              <div className="airdrops-filter-bar__search">
                <Skeleton className="h-9 w-full rounded-sm" />
              </div>
            </div>
            <div className="airdrops-filter-bar__tabs-row">
              <div className="flex flex-1 gap-2 overflow-hidden py-1">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-16 shrink-0 rounded-md" />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="airdrops-body">
          <section className="airdrops-list">
            <div className="airdrops-list__head" aria-hidden>
              <span className="airdrops-list__head-save" />
              <Skeleton variant="line" className="h-3 w-14" />
              <Skeleton variant="line" className="h-3 w-10" />
              <Skeleton variant="line" className="hidden h-3 w-10 md:block" />
              <Skeleton variant="line" className="h-3 w-12 md:justify-self-start" />
              <Skeleton variant="line" className="h-3 w-10 justify-self-end" />
            </div>
            <div className="airdrops-list__scroll">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="airdrops-list__row airdrops-list__row--skeleton">
                  <Skeleton className="h-7 w-7 shrink-0 justify-self-center rounded-sm" />
                  <div className="flex items-center gap-2">
                    <Skeleton variant="circle" className="h-6 w-6 shrink-0" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                  <Skeleton className="h-3.5 w-16 justify-self-end md:justify-self-start" />
                  <Skeleton className="hidden h-3.5 w-10 md:block" />
                  <Skeleton className="h-4 w-12 justify-self-center md:justify-self-start rounded-sm" />
                  <Skeleton variant="line" className="h-3 w-10 justify-self-end" />
                </div>
              ))}
            </div>
          </section>
        </div>
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
