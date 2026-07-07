"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";
import { syncPushSubscriptionIfGranted } from "@/lib/push/client";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    // SerwistProvider registers the SW — we only sync existing subscriptions, never register again.
    const timer = window.setTimeout(() => {
      void syncPushSubscriptionIfGranted();
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
      {children}
    </SerwistProvider>
  );
}
