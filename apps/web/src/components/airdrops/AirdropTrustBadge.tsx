import { PumpIcon, faShieldCheck } from "@/lib/icons";

type AirdropTrustBadgeProps = {
  className?: string;
};

/** User-facing trust signal — rewards are locked in the campaign contract. */
export function AirdropTrustBadge({ className = "" }: AirdropTrustBadgeProps) {
  return (
    <span
      className={`airdrop-trust-badge inline-flex shrink-0 items-center gap-1.5 ${className}`}
      title="Reward pool is locked on-chain until distribution"
    >
      <PumpIcon icon={faShieldCheck} className="airdrop-trust-badge__icon shrink-0" aria-hidden />
      <span className="airdrop-trust-badge__label">Guaranteed rewards</span>
    </span>
  );
}
