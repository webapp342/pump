import { PumpIcon, faClock } from "@/lib/icons";

type Props = {
  title: string;
  description?: string;
};

/** Faz 6 — Solana programs (airdrop / KOL escrow) not shipped yet. */
export function SolanaDeferredFeature({ title, description }: Props) {
  return (
    <div className="panel-surface mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pump-surface-2)]">
        <PumpIcon icon={faClock} className="h-5 w-5 text-[var(--pump-text-muted)]" />
      </div>
      <h1 className="text-xl font-semibold text-[var(--pump-text)]">{title}</h1>
      <p className="mt-3 text-sm text-[var(--pump-text-muted)]">
        {description ??
          "This feature is coming soon on Solana. Airdrop and KOL marketplace programs are planned for a later release."}
      </p>
    </div>
  );
}
