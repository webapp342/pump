import { AppShell } from "@/components/layout/AppShell";
import { CreateAirdropForm } from "@/components/airdrops/CreateAirdropForm";
import { isSolanaChainFamily } from "@/config/chain-family";
import { SolanaDeferredFeature } from "@/components/solana/SolanaDeferredFeature";

type PageProps = {
  searchParams: Promise<{ token?: string; name?: string; symbol?: string }>;
};

export default async function CreateAirdropPage({ searchParams }: PageProps) {
  const { token, name, symbol } = await searchParams;

  if (isSolanaChainFamily) {
    return (
      <AppShell>
        <SolanaDeferredFeature title="Airdrops coming soon on Solana" />
      </AppShell>
    );
  }

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
