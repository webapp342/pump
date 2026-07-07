"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";
import {
  preparePushInfrastructure,
  PushReloadPendingError,
  syncPushSubscriptionIfGranted,
} from "@/lib/push/client";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;

    const timer = window.setTimeout(() => {
      void preparePushInfrastructure().catch((error) => {
        if (error instanceof PushReloadPendingError) return;
      });
    }, 1_500);

    const syncTimer = window.setTimeout(() => {
      void syncPushSubscriptionIfGranted();
    }, 4_000);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(syncTimer);
    };
  }, []);

  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === "development"}
      options={{ scope: "/" }}
    >
      {children}
    </SerwistProvider>
  );
}
