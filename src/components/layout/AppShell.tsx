"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppNav } from "@/components/layout/AppNav";
import { shellMaxWidthClassForPath, shellPaddingXClass, shellWideMaxWidthClass } from "@/components/layout/layout-shell";

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
