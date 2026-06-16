"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppNav } from "@/components/layout/AppNav";
import { shellMaxWidthClassForPath, shellPaddingXClass, shellWideMaxWidthClass } from "@/components/layout/layout-shell";
import { noteNavFromCurrentPath, syncNavHistory } from "@/lib/nav-history";

type AppShellProps = {
  children: React.ReactNode;
  /** Wider content area (token detail chart + trade panel) */
  wide?: boolean;
};

export function AppShell({ children, wide = false }: AppShellProps) {
  const pathname = usePathname();
  const mainMaxWidth = wide ? shellWideMaxWidthClass : shellMaxWidthClassForPath(pathname);
  const onTokenPage = pathname.startsWith("/token/");
  const mobileBottomOffset = onTokenPage ? "" : "pb-[var(--mobile-bottom-nav-height)]";

  useLayoutEffect(() => {
    syncNavHistory(pathname);
  }, [pathname]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("//") || /^https?:/i.test(href)) return;
      if (href.startsWith("/")) noteNavFromCurrentPath();
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main
        className={`mx-auto w-full flex-1 py-5 md:py-8 ${mobileBottomOffset} md:pb-8 ${mainMaxWidth} ${shellPaddingXClass}`}
      >
        {children}
      </main>
      <AppNav />
    </div>
  );
}
