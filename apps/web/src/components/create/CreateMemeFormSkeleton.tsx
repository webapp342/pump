import { Skeleton } from "@/components/ui/Skeleton";

export function CreateMemeFormSkeleton() {
  return (
    <div
      className="airdrops-page airdrop-create-page airdrop-create-page--token"
      aria-busy="true"
      aria-label="Loading create form"
    >
      <div className="airdrop-create-hub">
        <div className="airdrop-create-body">
          <div className="airdrop-create-form">
            <section className="airdrop-create-step-panel">
              <div className="airdrop-create-step-panel__body">
                <div className="token-create-sheet">
                  <div className="token-create-stack space-y-4">
                    <div className="token-create-identity__logo flex flex-col items-center gap-2">
                        <Skeleton variant="circle" className="h-16 w-16" />
                        <Skeleton className="h-8 w-20 rounded-md" />
                      </div>
                      <div className="token-create-field-grid">
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                      </div>
                      <div className="token-create-field-grid">
                        <Skeleton className="h-24 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                      </div>
                      <div className="token-create-social__grid">
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                      </div>
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                </div>
              </div>
            </section>
            <div className="airdrop-create-form__actions">
              <Skeleton className="h-10 flex-1 rounded-md" />
              <Skeleton className="h-10 min-w-[9.5rem] rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
