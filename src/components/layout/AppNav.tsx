"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { shellInnerClass } from "@/components/layout/layout-shell";

const links = [
  { href: "/", label: "Arena" },
  { href: "/airdrops", label: "Airdrops" },
  { href: "/missions", label: "Missions" },
  { href: "/portfolio", label: "Portfolio" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-pump-border/50 bg-pump-card pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      <div className={`flex ${shellInnerClass}`}>
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              prefetch={true}
              className={`flex-1 border-r border-pump-border/45 py-2.5 text-center text-caption font-semibold last:border-r-0 ${
                active
                  ? "bg-pump-border/12 text-pump-text"
                  : "text-pump-muted hover:bg-pump-border/6 hover:text-pump-text"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { links as appNavLinks };
