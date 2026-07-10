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
                <div className="token-create-sheet space-y-4">
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <div className="token-create-identity">
                    <div className="token-create-identity__logo flex flex-col items-center gap-2">
                      <Skeleton variant="circle" className="h-[4.5rem] w-[4.5rem]" />
                      <Skeleton className="h-8 w-20 rounded-md" />
                    </div>
                    <div className="token-create-identity__fields">
                      <div className="token-create-field-grid">
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                      </div>
                      <Skeleton className="h-24 w-full rounded-md" />
                    </div>
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
