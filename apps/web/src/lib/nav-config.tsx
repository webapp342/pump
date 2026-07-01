import type { PumpIconDefinition } from "@/lib/icons";
import { faAirdropParachute, faArrowLeftRight, faList, faTarget, faWallet } from "@/lib/pump-fa-icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: PumpIconDefinition;
};

/** Desktop header — Trade home first, then discovery + account tabs. */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/", label: "Trade", icon: faArrowLeftRight },
  { href: "/arena", label: "Arena", icon: faList },
  { href: "/airdrops", label: "Airdrops", icon: faAirdropParachute },
  { href: "/missions", label: "Missions", icon: faTarget },
  { href: "/portfolio", label: "Portfolio", icon: faWallet },
];

/** Mobile bottom dock — Trade is home (`/`). */
export const APP_BOTTOM_TAB_ITEMS: AppNavItem[] = [
  { href: "/", label: "Trade", icon: faArrowLeftRight },
  { href: "/arena", label: "Arena", icon: faList },
  { href: "/airdrops", label: "Airdrops", icon: faAirdropParachute },
  { href: "/missions", label: "Missions", icon: faTarget },
  { href: "/portfolio", label: "Portfolio", icon: faWallet },
];

export function isTradeHomeRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/trade" || pathname.startsWith("/token/");
}

export function isBottomNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return isTradeHomeRoute(pathname);
  }
  return isNavActive(pathname, href);
}

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
