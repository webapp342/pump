"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { PumpLogo } from "@/components/brand/PumpLogo";
import { WalletBar } from "@/components/wallet/WalletBar";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { APP_NAV_ITEMS, isTradeHomeRoute } from "@/lib/nav-config";
import { PumpIcon, faPlus } from "@/lib/icons";
import { shellHeaderInnerClass } from "@/components/layout/layout-shell";

function navLinkClass(active: boolean): string {
  return `header-nav-link ${active ? "header-nav-link-active" : "header-nav-link-idle"}`;
}

export function AppHeaderView({ pathname }: { pathname: string }) {
  const { ready, authenticated, scwAddress } = usePumpWallet();
  const { isConnected } = useAccount();
  const walletReady =
    ready && authenticated && Boolean(scwAddress) && isConnected;

  return (
    <header className="app-header">
      <div className={`app-header-inner ${shellHeaderInnerClass}`}>
        <div className="app-header-start">
          <Link href="/" className="app-header-brand">
            <span className="app-header-brand-mark">
              <PumpLogo size={22} className="md:hidden" />
              <PumpLogo size={32} className="hidden md:block" />
            </span>
            <span className="app-header-brand__name truncate">Pump</span>
          </Link>

          <nav className="app-header-nav hidden md:flex" aria-label="Primary">
            {APP_NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? isTradeHomeRoute(pathname)
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

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
          <ThemePicker
            className={
              walletReady
                ? "app-header-icon-btn hidden md:inline-flex"
                : "app-header-icon-btn"
            }
          />
          <Link
            href="/create"
            prefetch={true}
            aria-current={pathname.startsWith("/create") ? "page" : undefined}
            className={`app-header-create-btn${
              pathname.startsWith("/create") ? " app-header-create-btn--active" : ""
            }`}
          >
            <PumpIcon
              icon={faPlus}
              className="app-header-create-btn__icon app-header-create-btn__icon--desktop shrink-0"
            />
            <span className="app-header-create-btn__label">Create</span>
          </Link>
          <div className="app-header-actions__account">
            <WalletBar />
          </div>
        </div>
      </div>
    </header>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  return <AppHeaderView pathname={pathname} />;
}
