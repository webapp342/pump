import { AppHeader } from "@/components/layout/AppHeader";
import { AppNav } from "@/components/layout/AppNav";
import { shellInnerClass } from "@/components/layout/layout-shell";

type AppShellProps = {
  children: React.ReactNode;
  /** Wider content area (token detail, etc.) */
  wide?: boolean;
};

export function AppShell({ children, wide = false }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main
        className={`${shellInnerClass} flex-1 py-6 pb-24 md:py-8 md:pb-8`}
      >
        <div className="mx-auto w-full">{children}</div>
      </main>
      <AppNav />
    </div>
  );
}
