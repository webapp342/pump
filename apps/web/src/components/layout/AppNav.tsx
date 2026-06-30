"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_BOTTOM_TAB_ITEMS, isBottomNavActive } from "@/lib/nav-config";
import { isTokenRoute } from "@/components/layout/layout-shell";
import { PumpIcon } from "@/lib/icons";

export function AppNavView({ pathname }: { pathname: string }) {
  if (isTokenRoute(pathname)) return null;

  return (
    <div className="bottom-nav-host md:hidden">
      <nav className="bottom-nav" aria-label="Primary">
        {APP_BOTTOM_TAB_ITEMS.map((item) => {
          const active = isBottomNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-current={active ? "page" : undefined}
              className={`bottom-nav-item${active ? " bottom-nav-item-active" : ""}${
                item.href === "/trade" ? " bottom-nav-item--trade" : ""
              }`}
            >
              <span className="bottom-nav-item__icon" aria-hidden>
                <PumpIcon icon={item.icon} className="bottom-nav-icon" />
              </span>
              <span className="bottom-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppNav() {
  const pathname = usePathname();
  return <AppNavView pathname={pathname} />;
}
