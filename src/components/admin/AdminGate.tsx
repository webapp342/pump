"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { isAdminWallet } from "@/config/admin";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting } = useAccount();

  if (isConnecting) {
    return (
      <div className="admin-page">
        <div className="empty-state admin-empty">
          <p className="empty-state-copy">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (!isConnected || !isAdminWallet(address)) {
    return (
      <div className="admin-page py-16 text-center">
        <div className="empty-state mx-auto max-w-sm">
          <p className="page-title">404</p>
          <p className="empty-state-copy mt-2">Page not found.</p>
          <Link href="/" className="admin-link mt-4 inline-block">
            Back to Arena
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
