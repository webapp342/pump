import type { PumpIconDefinition } from "@/lib/icons";
import { faAirdropParachute, faArrowLeftRight, faList, faTarget, faWallet } from "@/lib/pump-icons";

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

/** Mobile bottom dock — Trade is home (`/`). Center FAB = Airdrops. */
export const BOTTOM_NAV_CENTER_HREF = "/airdrops";

export const APP_BOTTOM_TAB_ITEMS: AppNavItem[] = [
  { href: "/", label: "Trade", icon: faArrowLeftRight },
  { href: "/arena", label: "Arena", icon: faList },
  { href: BOTTOM_NAV_CENTER_HREF, label: "Airdrops", icon: faAirdropParachute },
  { href: "/missions", label: "Missions", icon: faTarget },
  { href: "/portfolio", label: "Portfolio", icon: faWallet },
];

export const APP_BOTTOM_TAB_SIDE_ITEMS = APP_BOTTOM_TAB_ITEMS.filter(
  (item) => item.href !== BOTTOM_NAV_CENTER_HREF
);

export const APP_BOTTOM_TAB_CENTER_ITEM = APP_BOTTOM_TAB_ITEMS.find(
  (item) => item.href === BOTTOM_NAV_CENTER_HREF
)!;

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
