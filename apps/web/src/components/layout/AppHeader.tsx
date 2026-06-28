"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PumpLogo } from "@/components/brand/PumpLogo";
import { WalletBar } from "@/components/wallet/WalletBar";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { APP_NAV_ITEMS } from "@/lib/nav-config";
import { PumpIcon, faPlus } from "@/lib/icons";
import { shellInnerClassForPath, shellTokenPageHeaderInnerClass } from "@/components/layout/layout-shell";

function navLinkClass(active: boolean): string {
  return `header-nav-link ${active ? "header-nav-link-active" : "header-nav-link-idle"}`;
}

export function AppHeaderView({ pathname }: { pathname: string }) {
  const onTokenPage = pathname.startsWith("/token/");
  return (
    <header className={onTokenPage ? "app-header app-header--card" : "app-header"}>
      <div
        className={`app-header-inner ${
          onTokenPage ? shellTokenPageHeaderInnerClass : shellInnerClassForPath(pathname)
        }`}
      >
        <div className="app-header-start">
          <Link href="/" className="app-header-brand">
            <span className="app-header-brand-mark">
              <PumpLogo size={32} />
            </span>
            <span className="truncate">Pump</span>
          </Link>

          <nav className="app-header-nav hidden md:flex" aria-label="Primary">
            {APP_NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  aria-current={active ? "page" : undefined}
                  className={navLinkClass(active)}
                >
                  <PumpIcon icon={item.icon} className="h-4 w-4 shrink-0 opacity-80" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="app-header-actions">
          <ThemePicker />
          <Link
            href="/create"
            prefetch={true}
            aria-current={pathname.startsWith("/create") ? "page" : undefined}
            className={`toolbar-btn toolbar-btn-accent hidden sm:inline-flex ${
              pathname.startsWith("/create") ? "opacity-95" : ""
            }`}
          >
            <PumpIcon icon={faPlus} className="h-4 w-4 shrink-0" />
            Create
          </Link>
          <WalletBar />
        </div>
      </div>
    </header>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  return <AppHeaderView pathname={pathname} />;
}
