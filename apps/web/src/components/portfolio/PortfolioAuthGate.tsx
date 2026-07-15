"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";

/**
 * Unauthenticated visitors never see portfolio content —
 * open the sign-in modal and leave the route.
 */
export function PortfolioAuthGate({ children }: { children: ReactNode }) {
  const { ready, authenticated, login } = usePumpWallet();
  const router = useRouter();
  const gatedRef = useRef(false);

  useEffect(() => {
    if (!ready || authenticated || gatedRef.current) return;
    gatedRef.current = true;
    login();
    router.replace("/");
  }, [ready, authenticated, login, router]);

  if (!ready || !authenticated) {
    return null;
  }

  return children;
}
