import type { PumpIconDefinition } from "@/lib/icons";
import { faPlus } from "@/lib/icons";
import { faAirdropParachute, faList, faTarget, faWallet } from "@/lib/pump-fa-icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: PumpIconDefinition;
};

/** Desktop header — full primary navigation. */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/", label: "Arena", icon: faList },
  { href: "/airdrops", label: "Airdrops", icon: faAirdropParachute },
  { href: "/missions", label: "Missions", icon: faTarget },
  { href: "/portfolio", label: "Portfolio", icon: faWallet },
];

/** Mobile floating bottom bar — five direct destinations, no overflow menu. */
export const APP_BOTTOM_TAB_ITEMS: AppNavItem[] = [
  { href: "/", label: "Arena", icon: faList },
  { href: "/airdrops", label: "Airdrops", icon: faAirdropParachute },
  { href: "/create", label: "Create", icon: faPlus },
  { href: "/missions", label: "Missions", icon: faTarget },
  { href: "/portfolio", label: "Portfolio", icon: faWallet },
];

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
