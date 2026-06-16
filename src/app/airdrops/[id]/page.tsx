import { AppShell } from "@/components/layout/AppShell";
import { PageBackLink } from "@/components/ui/PageBackLink";
import { AirdropDetailPanel } from "@/components/airdrops/AirdropDetailPanel";
type PageProps = { params: Promise<{ id: string }> };

export default async function AirdropDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <AppShell>
      <div className="min-w-0 space-y-3 md:space-y-4">
        <PageBackLink href="/airdrops" />
        <AirdropDetailPanel airdropId={id} />
      </div>
    </AppShell>
  );
}
