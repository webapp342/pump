"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  APP_BOTTOM_TAB_CENTER_ITEM,
  APP_BOTTOM_TAB_SIDE_ITEMS,
  BOTTOM_NAV_CENTER_HREF,
  isBottomNavActive,
} from "@/lib/nav-config";
import { PumpIcon } from "@/lib/icons";

function BottomNavTab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: (typeof APP_BOTTOM_TAB_SIDE_ITEMS)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={true}
      aria-current={active ? "page" : undefined}
      className={`bottom-nav-item${active ? " bottom-nav-item-active" : ""}`}
    >
      <span className="bottom-nav-item__icon" aria-hidden>
        <PumpIcon icon={icon} className="bottom-nav-icon" />
      </span>
      <span className="bottom-nav-label">{label}</span>
    </Link>
  );
}

export function AppNavView({ pathname }: { pathname: string }) {
  const leftItems = APP_BOTTOM_TAB_SIDE_ITEMS.slice(0, 2);
  const rightItems = APP_BOTTOM_TAB_SIDE_ITEMS.slice(2);
  const centerActive = isBottomNavActive(pathname, BOTTOM_NAV_CENTER_HREF);
  const centerItem = APP_BOTTOM_TAB_CENTER_ITEM;

  return (
    <div className="bottom-nav-host md:hidden">
      <nav className="bottom-nav" aria-label="Primary">
        {leftItems.map((item) => (
          <BottomNavTab
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isBottomNavActive(pathname, item.href)}
          />
        ))}

        <Link
          href={centerItem.href}
          prefetch={true}
          aria-current={centerActive ? "page" : undefined}
          aria-label={centerItem.label}
          className={`bottom-nav-fab${centerActive ? " bottom-nav-fab--active" : ""}`}
        >
          <span className="bottom-nav-fab__ring">
            <PumpIcon icon={centerItem.icon} className="bottom-nav-fab__icon" />
          </span>
        </Link>

        {rightItems.map((item) => (
          <BottomNavTab
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isBottomNavActive(pathname, item.href)}
          />
        ))}
      </nav>
    </div>
  );
}

export function AppNav() {
  const pathname = usePathname();
  return <AppNavView pathname={pathname} />;
}
