import { Skeleton } from "@/components/ui/Skeleton";

export function CreateMemeFormSkeleton() {
  return (
    <div
      className="create-meme-form grid gap-3 pb-[var(--mobile-main-bottom-pad)] md:gap-4 md:pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:items-start"
      aria-busy="true"
      aria-label="Loading create form"
    >
      <div className="space-y-3 md:space-y-4">
        <section className="panel-surface p-3 md:p-5">
          <Skeleton variant="line" className="h-3 w-24" />
          <div className="mt-3 flex flex-col gap-4 sm:mt-4 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex items-center gap-3 sm:w-[5.75rem] sm:shrink-0 sm:flex-col sm:items-center">
              <Skeleton variant="circle" className="h-14 w-14 sm:h-[4.5rem] sm:w-[4.5rem]" />
              <Skeleton className="h-8 w-24 rounded-md sm:w-full" />
              <Skeleton variant="line" className="h-3 w-full max-w-[8rem] sm:text-center" />
            </div>
            <div className="min-w-0 flex-1 space-y-3 md:space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Skeleton variant="line" className="h-3 w-20" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton variant="line" className="h-3 w-14" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Skeleton variant="line" className="h-3 w-24" />
                <Skeleton className="h-[5.5rem] w-full rounded-md md:h-[6.5rem]" />
              </div>
            </div>
          </div>
        </section>

        <section className="panel-surface p-3 md:p-5">
          <Skeleton variant="line" className="h-3 w-28" />
          <div className="mt-3 space-y-3 md:mt-4">
            <Skeleton variant="line" className="h-3 w-20" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="rounded-md border border-pump-border/20 bg-pump-surface/65 px-3 py-2.5 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} variant="line" className="h-3 w-full" />
              ))}
            </div>
          </div>
        </section>
      </div>

      <aside className="panel-surface hidden p-4 xl:block">
        <Skeleton variant="line" className="h-3 w-24" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-3">
              <Skeleton variant="line" className="h-3 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-5 h-11 w-full rounded-md" />
      </aside>
    </div>
  );
}
