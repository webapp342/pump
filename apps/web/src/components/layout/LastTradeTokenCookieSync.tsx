"use client";

import { useLayoutEffect } from "react";
import { syncLastTradeTokenPersistence } from "@/lib/last-trade-token";

/** Align last-trade localStorage + cookie on every app load (localStorage wins). */
export function LastTradeTokenCookieSync() {
  useLayoutEffect(() => {
    syncLastTradeTokenPersistence();
  }, []);

  return null;
}
