"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { isAdminWallet } from "@/config/admin";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting } = useAccount();

  if (isConnecting) {
    return (
      <div className="admin-page">
        <p className="admin-empty">Verifying access…</p>
      </div>
    );
  }

  if (!isConnected || !isAdminWallet(address)) {
    return (
      <div className="admin-page py-16 text-center">
        <p className="admin-title">404</p>
        <p className="admin-meta mt-2">Page not found.</p>
        <Link href="/" className="admin-link mt-4 inline-block">
          Back to Arena
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
