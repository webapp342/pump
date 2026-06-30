import type { PumpIconDefinition } from "@/lib/icons";
import { faPlus } from "@/lib/icons";
import { faAirdropParachute, faArrowLeftRight, faList, faTarget, faWallet } from "@/lib/pump-fa-icons";

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

/** Mobile bottom dock — four tabs + Trade (Create lives in header). */
export const APP_BOTTOM_TAB_ITEMS: AppNavItem[] = [
  { href: "/", label: "Arena", icon: faList },
  { href: "/airdrops", label: "Airdrops", icon: faAirdropParachute },
  { href: "/trade", label: "Trade", icon: faArrowLeftRight },
  { href: "/missions", label: "Missions", icon: faTarget },
  { href: "/portfolio", label: "Portfolio", icon: faWallet },
];

export function isBottomNavActive(pathname: string, href: string): boolean {
  if (href === "/trade") {
    return pathname === "/trade" || pathname.startsWith("/token/");
  }
  return isNavActive(pathname, href);
}

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
