"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTokenRoute } from "@/components/layout/layout-shell";
import { TokenTradeDockPill } from "@/components/token/TokenTradeDock";
import { useTokenMobileTradeDock } from "@/components/token/TokenMobileTradeDockContext";
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
  const tradeDock = useTokenMobileTradeDock();
  const showTradeDock = isTokenRoute(pathname) && tradeDock != null;

  return (
    <div className="bottom-nav-host md:hidden">
      <nav
        className={`bottom-nav${showTradeDock ? " bottom-nav--trade" : ""}`}
        aria-label={showTradeDock ? "Trade actions" : "Primary"}
      >
        {showTradeDock ? (
          <div className="bottom-nav-trade-slot">
            <TokenTradeDockPill {...tradeDock} />
          </div>
        ) : (
          APP_BOTTOM_TAB_ITEMS.map((item) => (
            <BottomNavTab
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isBottomNavActive(pathname, item.href)}
            />
          ))
        )}
      </nav>
    </div>
  );
}

export function AppNav() {
  const pathname = usePathname();
  return <AppNavView pathname={pathname} />;
}
