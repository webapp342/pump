import { AirdropParachute } from "@/components/icons/AirdropParachute";

type AirdropPromoIconProps = {
  className?: string;
  size?: number;
};

/** Animated parachute marker for tokens with an open airdrop campaign. */
export function AirdropPromoIcon({ className = "", size = 13 }: AirdropPromoIconProps) {
  return (
    <span className={`airdrop-promo-icon inline-flex shrink-0 ${className}`} aria-hidden>
      <AirdropParachute className="airdrop-promo-icon__glyph" size={size} />
    </span>
  );
}

/** @deprecated Use AirdropPromoIcon */
export const AirdropGiftIcon = AirdropPromoIcon;
