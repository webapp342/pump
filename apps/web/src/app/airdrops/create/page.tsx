import { AppShell } from "@/components/layout/AppShell";
import { CreateAirdropForm } from "@/components/airdrops/CreateAirdropForm";

type PageProps = {
  searchParams: Promise<{ token?: string; name?: string; symbol?: string }>;
};

export default async function CreateAirdropPage({ searchParams }: PageProps) {
  const { token, name, symbol } = await searchParams;

  return (
    <AppShell>
      <CreateAirdropForm
        initialLinkedToken={token}
        initialLinkedTokenName={name}
        initialLinkedTokenSymbol={symbol}
      />
    </AppShell>
  );
}
