"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";
import {
  preparePushInfrastructure,
  PushReloadPendingError,
  shouldUseMinimalPushWorker,
  syncPushSubscriptionIfGranted,
} from "@/lib/push/client";
import { isMobilePwaClient } from "@/lib/push/platform";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const mobilePwa = isMobilePwaClient();
  const skipSerwist = !mobilePwa || shouldUseMinimalPushWorker();

  useEffect(() => {
    if (!mobilePwa || process.env.NODE_ENV === "development") return;

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

    // Serwist: delayed skipWaiting avoids install hang (serwist/serwist#276).
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
  }, [mobilePwa, skipSerwist]);

  if (!mobilePwa || skipSerwist) {
    // Desktop: no PWA. Mobile iOS/Android: lightweight push-sw.js instead of Serwist precache.
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
