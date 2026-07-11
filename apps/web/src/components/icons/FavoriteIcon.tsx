import { PumpIcon } from "@/lib/icons";
import { faStarRegular, faStarSolid } from "@/lib/pump-icons";

type FavoriteIconProps = {
  active: boolean;
  className?: string;
};

export function FavoriteIcon({ active, className = "h-4 w-4" }: FavoriteIconProps) {
  return (
    <PumpIcon icon={active ? faStarSolid : faStarRegular} className={className} />
  );
}
