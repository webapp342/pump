"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { AppHeaderView } from "@/components/layout/AppHeader";
import { AppNavView } from "@/components/layout/AppNav";
import {
  isTokenRoute,
  shellMainLayoutClass,
  shellMainPaddingClass,
} from "@/components/layout/layout-shell";
import { noteNavFromCurrentPath, syncNavHistory } from "@/lib/nav-history";

type AppShellProps = {
  children: React.ReactNode;
  /** Wider content area (token detail chart + trade panel) */
  wide?: boolean;
};

type AppShellFrameProps = AppShellProps & {
  /** Static pathname for prerender / loading fallbacks (no usePathname). */
  pathname: string;
};

/** Prerender-safe shell — use in route `loading.tsx` and Suspense fallbacks. */
export function AppShellFrame({ children, wide = false, pathname }: AppShellFrameProps) {
  const onTokenPage = isTokenRoute(pathname);
  const mobileBottomOffset = onTokenPage
    ? ""
    : "max-md:pb-[var(--mobile-main-bottom-pad)]";
  const mainPadding = shellMainPaddingClass(pathname);
  const mainLayoutClass = shellMainLayoutClass(pathname, wide);

  return (
    <div className={onTokenPage ? "app-shell app-shell--token" : "flex min-h-screen flex-col"}>
      <AppHeaderView pathname={pathname} />
      <main
        className={`flex min-h-0 flex-col ${mainPadding} ${mobileBottomOffset} ${mainLayoutClass}`}
      >
        {children}
      </main>
      <AppNavView pathname={pathname} />
    </div>
  );
}

export function AppShell({ children, wide = false }: AppShellProps) {
  const pathname = usePathname();

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
    <AppShellFrame wide={wide} pathname={pathname}>
      {children}
    </AppShellFrame>
  );
}
