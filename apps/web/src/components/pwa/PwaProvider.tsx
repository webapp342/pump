"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";
import {
  preparePushInfrastructure,
  PushReloadPendingError,
  shouldUseIosMinimalPushWorker,
  syncPushSubscriptionIfGranted,
} from "@/lib/push/client";

function detectIosStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return shouldUseIosMinimalPushWorker();
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const iosPwa = detectIosStandalonePwa();

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;

    const prepDelay = iosPwa ? 500 : 1_500;
    const syncDelay = iosPwa ? 3_000 : 4_000;

    const timer = window.setTimeout(() => {
      void preparePushInfrastructure().catch((error) => {
        if (error instanceof PushReloadPendingError) return;
      });
    }, prepDelay);

    const syncTimer = window.setTimeout(() => {
      void syncPushSubscriptionIfGranted();
    }, syncDelay);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(syncTimer);
    };
  }, [iosPwa]);

  if (iosPwa) {
    // iOS Home Screen: Serwist precache hangs in "installing" — use /push-sw.js instead.
    return <>{children}</>;
  }

  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === "development"}
      options={{ scope: "/", type: "classic" }}
    >
      {children}
    </SerwistProvider>
  );
}
