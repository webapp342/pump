import { AppShell } from "@/components/layout/AppShell";
import { TokenDetailBodySkeleton } from "@/components/token/TokenDetailBodySkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export function TokenDetailSkeleton() {
  return (
    <AppShell wide>
      <Skeleton variant="line" className="h-4 w-16" />
      <TokenDetailBodySkeleton />
    </AppShell>
  );
}
