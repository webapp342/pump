"use client";

import { useEffect } from "react";

const LOCK_CLASS = "hub-discovery-scroll-lock";

/** Mobile Arena / Airdrops — lock document scroll; only in-page list regions scroll. */
export function HubDiscoveryScrollLock() {
  useEffect(() => {
    document.documentElement.classList.add(LOCK_CLASS);
    return () => document.documentElement.classList.remove(LOCK_CLASS);
  }, []);
  return null;
}
