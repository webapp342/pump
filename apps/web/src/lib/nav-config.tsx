import type { PumpIconDefinition } from "@/lib/icons";
import { faAirdropParachute, faList, faTarget, faWallet } from "@/lib/pump-fa-icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: PumpIconDefinition;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/", label: "Arena", icon: faList },
  { href: "/airdrops", label: "Airdrops", icon: faAirdropParachute },
  { href: "/missions", label: "Missions", icon: faTarget },
  { href: "/portfolio", label: "Portfolio", icon: faWallet },
];
