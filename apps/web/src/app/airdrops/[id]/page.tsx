import { Suspense } from "react";
import { AppShellFrame } from "@/components/layout/AppShell";
import { AirdropDetailPageLoader } from "@/components/airdrops/AirdropDetailPageLoader";
import { AirdropDetailSkeleton } from "@/components/airdrops/AirdropsSkeleton";

type PageProps = { params: Promise<{ id: string }> };

export default async function AirdropDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <AppShellFrame pathname="/airdrops">
          <AirdropDetailSkeleton />
        </AppShellFrame>
      }
    >
      <AirdropDetailPageLoader airdropId={id} />
    </Suspense>
  );
}
