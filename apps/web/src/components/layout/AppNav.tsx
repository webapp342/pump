"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_BOTTOM_TAB_ITEMS, isBottomNavActive } from "@/lib/nav-config";
import { PumpIcon } from "@/lib/icons";

function BottomNavTab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: (typeof APP_BOTTOM_TAB_ITEMS)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={true}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`bottom-nav-item${active ? " bottom-nav-item-active" : ""}`}
    >
      <PumpIcon icon={icon} className="bottom-nav-icon" />
    </Link>
  );
}

export function AppNavView({ pathname }: { pathname: string }) {
  return (
    <div className="bottom-nav-host md:hidden">
      <nav className="bottom-nav" aria-label="Primary">
        {APP_BOTTOM_TAB_ITEMS.map((item) => (
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
