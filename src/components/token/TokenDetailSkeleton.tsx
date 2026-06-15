import { AppShell } from "@/components/layout/AppShell";
import { PageIntroSkeleton } from "@/components/ui/PageIntroSkeleton";
import { TokenDetailBodySkeleton } from "@/components/token/TokenDetailBodySkeleton";

export function TokenDetailSkeleton() {
  return (
    <AppShell wide>
      <PageIntroSkeleton />
      <TokenDetailBodySkeleton />
    </AppShell>
  );
}
