"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { APP_NAV_ITEMS } from "@/lib/nav-config";
import { ICON_STROKE } from "@/lib/icons";

function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const BEFORE_CREATE = APP_NAV_ITEMS.slice(0, 2);
const AFTER_CREATE = APP_NAV_ITEMS.slice(2);

export function AppNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/token/")) {
    return null;
  }

  return (
    <nav className="bottom-nav md:hidden" aria-label="Primary">
      {BEFORE_CREATE.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            aria-current={active ? "page" : undefined}
            className={`bottom-nav-item ${active ? "bottom-nav-item-active" : ""}`}
          >
            <Icon
              className="bottom-nav-icon"
              strokeWidth={active ? 2.25 : ICON_STROKE}
              aria-hidden
            />
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}

      <Link
        href="/create"
        prefetch={true}
        aria-current={pathname.startsWith("/create") ? "page" : undefined}
        className={`bottom-nav-fab ${pathname.startsWith("/create") ? "bottom-nav-fab-active" : ""}`}
        aria-label="Create token"
      >
        <span className="bottom-nav-fab-icon" aria-hidden>
          <Plus className="h-6 w-6" strokeWidth={2.25} />
        </span>
        <span className="bottom-nav-label">Create</span>
      </Link>

      {AFTER_CREATE.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            aria-current={active ? "page" : undefined}
            className={`bottom-nav-item ${active ? "bottom-nav-item-active" : ""}`}
          >
            <Icon
              className="bottom-nav-icon"
              strokeWidth={active ? 2.25 : ICON_STROKE}
              aria-hidden
            />
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
