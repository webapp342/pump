import { Skeleton } from "@/components/ui/Skeleton";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

export function AirdropsSkeleton() {
  return (
    <div className="airdrops-page" aria-busy="true" aria-label="Loading airdrops">
      <HubDiscoveryScrollLock />
      <div className="airdrops-hub">
        <div className="airdrops-page__sticky">
          <div className="airdrops-filter-bar">
            <div className="airdrops-filter-bar__mobile-head md:hidden">
              <div className="airdrops-filter-bar__tabs-row airdrops-filter-bar__tabs-row--mobile">
                <div className="flex flex-1 gap-2 overflow-hidden py-1">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-9 w-16 shrink-0 rounded-md" />
                  ))}
                </div>
              </div>
            </div>
            <div className="airdrops-filter-bar__mobile-search md:hidden">
              <Skeleton className="h-10 w-full rounded-sm" />
            </div>
            <div className="airdrops-filter-bar__main airdrops-filter-bar__main--desktop hidden md:flex">
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
        </div>

        <div className="airdrops-body">
          <div className="airdrops-mobile-list airdrops-mobile-list--mobile md:hidden">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="airdrop-mobile-campaign-row airdrop-mobile-campaign-row--skeleton">
                <Skeleton className="h-[3.25rem] w-[3.25rem] shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton variant="line" className="h-3 w-24" />
                  <Skeleton variant="line" className="h-3 w-20" />
                </div>
                <div className="space-y-1.5 text-right">
                  <Skeleton variant="line" className="ml-auto h-3 w-10" />
                  <Skeleton variant="line" className="ml-auto h-3 w-12" />
                  <Skeleton className="ml-auto h-4 w-14" />
                </div>
              </div>
            ))}
          </div>

          <section className="airdrops-list airdrops-list--desktop hidden md:flex" aria-hidden>
            <div className="airdrops-list__head">
              <Skeleton variant="line" className="h-3 w-14" />
              <Skeleton variant="line" className="h-3 w-10" />
              <Skeleton variant="line" className="h-3 w-10" />
              <Skeleton variant="line" className="h-3 w-12" />
              <Skeleton variant="line" className="h-3 w-10" />
            </div>
            <div className="airdrops-list__scroll">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="airdrops-list__row airdrops-list__row--skeleton">
                  <div className="flex items-center gap-2">
                    <Skeleton variant="circle" className="h-6 w-6 shrink-0" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                  <Skeleton className="h-3.5 w-16 justify-self-end" />
                  <Skeleton className="h-3.5 w-10" />
                  <Skeleton className="h-4 w-12 justify-self-center rounded-sm" />
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
    <div className="airdrops-page airdrop-detail-page" aria-busy="true" aria-label="Loading airdrop">
      <div className="airdrop-detail-hub">
        <div className="airdrop-detail-toolbar-band">
          <Skeleton variant="line" className="mx-3 my-2 h-4 w-14" />
          <div className="token-detail-toolbar airdrop-detail-toolbar">
            <div className="token-detail-toolbar__row">
              <div className="token-detail-toolbar__identity">
                <Skeleton className="h-5 w-5 shrink-0 rounded-sm" />
                <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-36 max-w-full" />
                  <Skeleton variant="line" className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-6 w-16 shrink-0 rounded-md" />
            </div>
            <div className="mt-2 flex gap-3 border-t border-pump-border/10 pt-2 md:mt-0 md:gap-4 md:border-t-0 md:pt-0">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="space-y-1">
                  <Skeleton variant="line" className="h-2.5 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="airdrop-detail-body">
          <div className="airdrop-detail-body__grid">
            <section className="airdrop-detail-section">
              <div className="airdrop-detail-section__head">
                <Skeleton variant="line" className="h-3 w-24" />
                <Skeleton variant="line" className="mt-1.5 h-3 w-48 max-w-full" />
              </div>
              <div className="airdrop-detail-task-list">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="airdrop-detail-task-row">
                    <Skeleton className="h-4 w-36 max-w-full" />
                    <Skeleton className="h-6 w-16 shrink-0 rounded-md" />
                  </div>
                ))}
              </div>
            </section>

            <section className="airdrop-detail-section airdrop-detail-section--board">
              <div className="airdrop-detail-section__head">
                <Skeleton variant="line" className="h-3 w-20" />
                <Skeleton variant="line" className="mt-1.5 h-3 w-56 max-w-full" />
              </div>
              <div className="airdrop-detail-board p-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 border-b border-pump-border/10 py-2 last:border-b-0"
                  >
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
      </div>
    </div>
  );
}
