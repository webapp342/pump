import { PumpIcon, faLock } from "@/lib/icons";

type AirdropTrustBadgeProps = {
  className?: string;
  /** Compact chip: icon-only on mobile, icon + label from md up. */
  compact?: boolean;
};

/** User-facing trust signal — rewards are locked in the campaign contract. */
export function AirdropTrustBadge({ className = "", compact = false }: AirdropTrustBadgeProps) {
  return (
    <span
      className={`airdrop-trust-badge inline-flex shrink-0 items-center ${compact ? "airdrop-trust-badge--compact" : "gap-1"} ${className}`}
      title="Reward pool is locked on-chain until distribution"
      aria-label="Locked reward pool"
    >
      <PumpIcon icon={faLock} size="xs" active={false} className="airdrop-trust-badge__icon shrink-0" aria-hidden />
      {compact ? null : <span className="airdrop-trust-badge__label">Locked pool</span>}
    </span>
  );
}
