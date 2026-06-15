import { Skeleton } from "@/components/ui/Skeleton";

export function PortfolioPanelSkeleton() {
  return (
    <div className="space-y-3 md:space-y-4">
      <div className="panel-surface p-3 md:p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-md" />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <section className="divide-y divide-pump-border/10 rounded-lg border border-pump-border/15">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="p-2.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-3 w-full" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
