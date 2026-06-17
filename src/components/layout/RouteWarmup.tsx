"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ROUTES = ["/", "/create", "/missions", "/portfolio"] as const;

/**
 * Prefetch tab routes so client navigation feels instant.
 * Arena data is SSR'd on `/` — no global /api/tokens warmup (saves a heavy DB hit every session).
 */
export function RouteWarmup() {
  const router = useRouter();

  useEffect(() => {
    for (const href of ROUTES) {
      router.prefetch(href);
    }
  }, [router]);

  return null;
}
