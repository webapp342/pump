"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";
import {
  preparePushInfrastructure,
  PushReloadPendingError,
  shouldUseMinimalPushWorker,
  syncPushSubscriptionIfGranted,
} from "@/lib/push/client";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const skipSerwist = shouldUseMinimalPushWorker();

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;

    const prepDelay = skipSerwist ? 500 : 1_500;
    const syncDelay = skipSerwist ? 3_000 : 4_000;

    const timer = window.setTimeout(() => {
      void preparePushInfrastructure().catch((error) => {
        if (error instanceof PushReloadPendingError) return;
      });
    }, prepDelay);

    const syncTimer = window.setTimeout(() => {
      void syncPushSubscriptionIfGranted();
    }, syncDelay);

    // Desktop Serwist: delayed skipWaiting avoids install hang (serwist/serwist#276).
    const skipTimer =
      skipSerwist ?
        undefined
      : window.setTimeout(() => {
          window.serwist?.messageSkipWaiting();
        }, 15_000);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(syncTimer);
      if (skipTimer !== undefined) window.clearTimeout(skipTimer);
    };
  }, [skipSerwist]);

  if (skipSerwist) {
    // Mobile: Serwist precache hangs — push uses /push-sw.js instead.
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
