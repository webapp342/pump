import { PumpIcon } from "@/lib/icons";
import { faStarRegular, faStarSolid } from "@/lib/pump-icons";
import type { IconSizeRole } from "@/lib/ui-sizes";

type FavoriteIconProps = {
  active: boolean;
  className?: string;
  size?: IconSizeRole | number;
};

export function FavoriteIcon({ active, className = "", size = "sm" }: FavoriteIconProps) {
  return (
    <PumpIcon
      icon={active ? faStarSolid : faStarRegular}
      size={size}
      className={className}
    />
  );
}
