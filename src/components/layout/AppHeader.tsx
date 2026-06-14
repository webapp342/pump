"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { WalletBar } from "@/components/wallet/WalletBar";
import { appNavLinks } from "@/components/layout/AppNav";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { isAdminWallet } from "@/config/admin";
import { shellInnerClass } from "@/components/layout/layout-shell";

function navLinkClass(active: boolean): string {
  return `header-nav-link ${active ? "header-nav-link-active" : "header-nav-link-idle"}`;
}

export function AppHeader() {
  const pathname = usePathname();
  const { address } = useAccount();
  const showAdminLink = isAdminWallet(address);

  const navItems = showAdminLink
    ? [...appNavLinks, { href: "/admin", label: "Admin" }]
    : appNavLinks;

  return (
    <header className="app-header">
      <div className={`app-header-inner ${shellInnerClass}`}>
        <div className="app-header-start">
          <Link href="/" className="app-header-brand">
            <span className="app-header-brand-mark" aria-hidden>
              P
            </span>
            <span className="truncate">Pump</span>
          </Link>

          <nav className="app-header-nav hidden md:flex" aria-label="Main">
            {navItems.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={true}
                  className={navLinkClass(active)}
                >
                  {link.label}
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
            className={`toolbar-btn toolbar-btn-accent hidden md:inline-flex ${
              pathname.startsWith("/create") ? "opacity-95" : ""
            }`}
          >
            + Create
          </Link>
          <WalletBar />
        </div>
      </div>
    </header>
  );
}
