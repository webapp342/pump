"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTokenRoute } from "@/components/layout/layout-shell";
import { TradeNavLink } from "@/components/layout/TradeNavLink";
import { TokenTradeDockPill } from "@/components/token/TokenTradeDock";
import { useTokenMobileTradeDock } from "@/components/token/TokenMobileTradeDockContext";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { APP_BOTTOM_TAB_ITEMS, isBottomNavActive } from "@/lib/nav-config";
import { PumpIcon } from "@/lib/icons";

function BottomNavTradeTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: (typeof APP_BOTTOM_TAB_ITEMS)[number]["icon"];
  active: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <TradeNavLink
      fallbackHref="/"
      prefetch={true}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`bottom-nav-item${active ? " bottom-nav-item-active" : ""}`}
      onClick={onClick}
    >
      <PumpIcon icon={icon} active={active} size="lg" className="bottom-nav-icon" />
    </TradeNavLink>
  );
}

function BottomNavRouteTab({
  href,
  label,
  icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: (typeof APP_BOTTOM_TAB_ITEMS)[number]["icon"];
  active: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      prefetch={true}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`bottom-nav-item${active ? " bottom-nav-item-active" : ""}`}
      onClick={onClick}
    >
      <PumpIcon icon={icon} active={active} size="lg" className="bottom-nav-icon" />
    </Link>
  );
}

export function AppNavView({ pathname }: { pathname: string }) {
  const tradeDock = useTokenMobileTradeDock();
  const { ready, authenticated, login } = usePumpWallet();
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
          APP_BOTTOM_TAB_ITEMS.map((item) => {
            const requiresAuth = item.href === "/portfolio";
            const onClick = requiresAuth
              ? (event: MouseEvent<HTMLAnchorElement>) => {
                  if (!ready || authenticated) return;
                  event.preventDefault();
                  login();
                }
              : undefined;
            const active = isBottomNavActive(pathname, item.href);

            if (item.href === "/") {
              return (
                <BottomNavTradeTab
                  key={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={active}
                  onClick={onClick}
                />
              );
            }

            return (
              <BottomNavRouteTab
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                onClick={onClick}
              />
            );
          })
        )}
      </nav>
    </div>
  );
}

export function AppNav() {
  const pathname = usePathname();
  return <AppNavView pathname={pathname} />;
}
