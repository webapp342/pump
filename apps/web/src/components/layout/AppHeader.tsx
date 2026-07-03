"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { CyclopsLogo } from "@/components/brand/CyclopsLogo";
import { WalletBar } from "@/components/wallet/WalletBar";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { APP_NAV_ITEMS, isTradeHomeRoute } from "@/lib/nav-config";
import { AppHeaderCreateMenu } from "@/components/layout/AppHeaderCreateMenu";
import { shellHeaderInnerClassForPath } from "@/components/layout/layout-shell";

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
      <div className={`app-header-inner ${shellHeaderInnerClassForPath(pathname)}`}>
        <div className="app-header-start">
          <Link href="/" className="app-header-brand" aria-label="Cyclops home">
            <CyclopsLogo variant="auto" />
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
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="app-header-actions">
          <AppHeaderCreateMenu />
          <div className="app-header-actions__account">
            <WalletBar />
          </div>
          {!walletReady ? <ThemePicker className="app-header-utility-btn" /> : null}
        </div>
      </div>
    </header>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  return <AppHeaderView pathname={pathname} />;
}
