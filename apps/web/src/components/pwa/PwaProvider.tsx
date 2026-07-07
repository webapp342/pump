"use client";

import { useEffect } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";
import { warmPushServiceWorker } from "@/lib/push/client";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    warmPushServiceWorker();
  }, []);

  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
      {children}
    </SerwistProvider>
  );
}
