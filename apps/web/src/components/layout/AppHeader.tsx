"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { WalletBar } from "@/components/wallet/WalletBar";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { APP_NAV_ITEMS } from "@/lib/nav-config";
import { ICON_STROKE } from "@/lib/icons";
import { shellInnerClassForPath } from "@/components/layout/layout-shell";

function navLinkClass(active: boolean): string {
  return `header-nav-link ${active ? "header-nav-link-active" : "header-nav-link-idle"}`;
}

export function AppHeaderView({ pathname }: { pathname: string }) {
  const onTokenPage = pathname.startsWith("/token/");
  return (
    <header className={onTokenPage ? "app-header app-header--card" : "app-header"}>
      <div className={`app-header-inner ${shellInnerClassForPath(pathname)}`}>
        <div className="app-header-start">
          <Link href="/" className="app-header-brand">
            <span className="app-header-brand-mark" aria-hidden>
              P
            </span>
            <span className="truncate">Pump</span>
          </Link>

          <nav className="app-header-nav hidden md:flex" aria-label="Primary">
            {APP_NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  aria-current={active ? "page" : undefined}
                  className={navLinkClass(active)}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={ICON_STROKE} aria-hidden />
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
            <Plus className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
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
