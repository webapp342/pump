"use client";

import { PageBackLink } from "@/components/ui/PageBackLink";
import { isAdminTelegramUser } from "@/config/admin";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, telegramId } = usePumpWallet();

  if (!ready) {
    return (
      <div className="admin-page">
        <div className="empty-state admin-empty">
          <p className="empty-state-copy">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (!authenticated || !isAdminTelegramUser(telegramId)) {
    return (
      <div className="admin-page py-16 text-center">
        <div className="empty-state mx-auto max-w-sm">
          <p className="page-title">404</p>
          <p className="empty-state-copy mt-2">Page not found.</p>
          <PageBackLink href="/" className="mt-4" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
