import type { PumpIconDefinition } from "@/lib/icons";
import {
  faAirdropParachute,
  faBaseWallet,
  faHurricane,
  faTokenLaunchRocket,
} from "@/lib/pump-icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: PumpIconDefinition;
};

/** Desktop header — Arena opens Trade home; discovery list stays on mobile dock. */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/arena", label: "Arena", icon: faTokenLaunchRocket },
  { href: "/airdrops", label: "Airdrops", icon: faAirdropParachute },
  { href: "/missions", label: "Rewards", icon: faHurricane },
  { href: "/portfolio", label: "Portfolio", icon: faBaseWallet },
];

/** Mobile bottom dock — Trade removed; home stays via logo / deep links. */
export const BOTTOM_NAV_CENTER_HREF = "/airdrops";

export const APP_BOTTOM_TAB_ITEMS: AppNavItem[] = [
  { href: "/arena", label: "Arena", icon: faTokenLaunchRocket },
  { href: BOTTOM_NAV_CENTER_HREF, label: "Airdrops", icon: faAirdropParachute },
  { href: "/missions", label: "Rewards", icon: faHurricane },
  { href: "/portfolio", label: "Portfolio", icon: faBaseWallet },
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
  return isNavActive(pathname, href);
}

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
