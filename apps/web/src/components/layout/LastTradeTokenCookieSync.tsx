"use client";

import { useEffect } from "react";
import { syncLastTradeTokenCookieFromStorage } from "@/lib/last-trade-token";

/** Keep middleware cookie in sync when user already has a last token in localStorage. */
export function LastTradeTokenCookieSync() {
  useEffect(() => {
    syncLastTradeTokenCookieFromStorage();
  }, []);

  return null;
}
