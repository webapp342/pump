import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CreateAirdropForm } from "@/components/airdrops/CreateAirdropForm";

type PageProps = {
  searchParams: Promise<{ token?: string; name?: string; symbol?: string }>;
};

export default async function CreateAirdropPage({ searchParams }: PageProps) {
  const { token, name, symbol } = await searchParams;

  return (
    <AppShell>
      <div className="space-y-3 md:space-y-4">
        <Link
          href="/airdrops"
          className="text-caption font-medium text-pump-muted transition hover:text-pump-accent"
        >
          ← Airdrops
        </Link>
        <CreateAirdropForm
          initialLinkedToken={token}
          initialLinkedTokenName={name}
          initialLinkedTokenSymbol={symbol}
        />
      </div>
    </AppShell>
  );
}
