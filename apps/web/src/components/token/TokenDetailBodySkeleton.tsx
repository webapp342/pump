import {
  SkeletonChartPanel,
  SkeletonTradePanel,
} from "@/components/ui/skeleton-parts";
import { Skeleton } from "@/components/ui/Skeleton";

export function TokenDetailBodySkeleton() {
  const toolbarSkeleton = (
    <div className="token-detail-toolbar panel-surface">
      <div className="token-detail-toolbar__identity">
        <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36 max-w-full" />
          <Skeleton variant="line" className="h-3 w-48 max-w-full" />
        </div>
      </div>
      <div className="token-detail-toolbar__actions">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-8 rounded-md" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="token-page" aria-busy="true" aria-label="Loading token">
      <div className="token-page-grid">
        <div className="token-page-toolbar-slot hidden lg:block">{toolbarSkeleton}</div>

        <div className="token-page-stack token-page-stack--sidebar hidden lg:flex">
          <section className="token-market-sidebar panel-surface">
            <div className="token-market-sidebar__toolbar">
              <Skeleton className="h-8 w-full rounded-md" />
              <div className="mt-2 flex gap-2">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-8" />
              </div>
            </div>
            <div className="token-market-sidebar__list p-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="mb-2 h-8 w-full rounded-sm" />
              ))}
            </div>
          </section>
        </div>

        <div className="token-page-stack token-page-stack--main">
          <div className="shrink-0 lg:hidden">{toolbarSkeleton}</div>
          <div className="token-page-chart-slot">
            <SkeletonChartPanel />
          </div>
          <div className="token-page-tape-slot">
            <section className="panel-surface token-trade-tape overflow-hidden">
              <div className="trade-panel-mode-tabs shrink-0">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="token-trade-tape__scroll">
                <table className="token-tape-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Amount</th>
                      <th className="token-tape-table__col-mid">$M</th>
                      <th>Price</th>
                      <th className="token-tape-table__col-end">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index}>
                        <td className="token-tape-table__account">
                          <Skeleton className="h-3.5 w-20" />
                        </td>
                        <td>
                          <Skeleton className="h-3.5 w-12" />
                        </td>
                        <td className="token-tape-table__col-mid">
                          <Skeleton className="mx-auto h-3.5 w-10" />
                        </td>
                        <td>
                          <Skeleton className="h-3.5 w-14" />
                        </td>
                        <td className="token-tape-table__col-end">
                          <Skeleton className="ml-auto h-3.5 w-14" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>

        <aside className="token-page-stack token-page-stack--aside hidden lg:flex">
          <SkeletonTradePanel />
          <div className="panel-surface p-4">
            <Skeleton variant="line" className="h-3 w-28" />
            <div className="mt-3 flex items-center gap-3">
              <Skeleton variant="circle" className="h-9 w-9" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="mt-4 h-8 w-full rounded-md" />
          </div>
        </aside>
      </div>
    </div>
  );
}
