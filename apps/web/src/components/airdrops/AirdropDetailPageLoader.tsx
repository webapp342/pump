import { connection } from "next/server";
import { AppShell } from "@/components/layout/AppShell";
import { AirdropDetailPanel } from "@/components/airdrops/AirdropDetailPanel";

type AirdropDetailPageLoaderProps = {
  airdropId: string;
};

/** Dynamic server island — keeps AppShell inside Suspense for Cache Components prerender. */
export async function AirdropDetailPageLoader({ airdropId }: AirdropDetailPageLoaderProps) {
  await connection();

  return (
    <AppShell>
      <AirdropDetailPanel airdropId={airdropId} />
    </AppShell>
  );
}
