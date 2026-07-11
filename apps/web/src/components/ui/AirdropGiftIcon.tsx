import { PumpIcon } from "@/lib/icons";
import { faAirdropParachute } from "@/lib/pump-icons";

type AirdropPromoIconProps = {
  className?: string;
  size?: number;
};

/** Animated parachute marker for tokens with an open airdrop campaign. */
export function AirdropPromoIcon({ className = "", size = 13 }: AirdropPromoIconProps) {
  return (
    <span
      className={`airdrop-promo-icon inline-flex shrink-0 ${className}`}
      style={{ fontSize: size }}
      aria-hidden
    >
      <PumpIcon icon={faAirdropParachute} className="airdrop-promo-icon__glyph" />
    </span>
  );
}

/** @deprecated Use AirdropPromoIcon */
export const AirdropGiftIcon = AirdropPromoIcon;
