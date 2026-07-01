"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveDisplayUsername } from "@/lib/username";

const cache = new Map<string, string>();

function cacheKey(address: string, compact: boolean): string {
  return `${address.toLowerCase()}:${compact ? "1" : "0"}`;
}

async function fetchDisplayNames(
  addresses: string[],
  compact: boolean
): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  const response = await fetch(
    `/api/user/display-names?addresses=${encodeURIComponent(addresses.join(","))}&compact=${compact ? "1" : "0"}`,
    { cache: "no-store" }
  );
  const body = (await response.json()) as {
    data?: { displayNames?: Record<string, string> };
  };
  if (!response.ok || !body.data?.displayNames) {
    throw new Error("Failed to load display names");
  }
  return body.data.displayNames;
}

export function useUserDisplayNames(addresses: string[], compact = true) {
  const normalized = useMemo(
    () =>
      [
        ...new Set(
          addresses
            .map((address) => address.toLowerCase())
            .filter((address) => /^0x[a-f0-9]{40}$/.test(address))
        ),
      ],
    [addresses]
  );

  const [version, setVersion] = useState(0);

  useEffect(() => {
    const missing = normalized.filter((address) => !cache.has(cacheKey(address, compact)));
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const names = await fetchDisplayNames(missing, compact);
        if (cancelled) return;
        for (const [address, label] of Object.entries(names)) {
          cache.set(cacheKey(address, compact), label);
        }
        setVersion((value) => value + 1);
      } catch {
        for (const address of missing) {
          cache.set(
            cacheKey(address, compact),
            resolveDisplayUsername(address, null, compact)
          );
        }
        if (!cancelled) setVersion((value) => value + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compact, normalized]);

  return useMemo(() => {
    void version;
    const lookup = new Map<string, string>();
    for (const address of normalized) {
      lookup.set(
        address,
        cache.get(cacheKey(address, compact)) ?? resolveDisplayUsername(address, null, compact)
      );
    }
    return lookup;
  }, [compact, normalized, version]);
}

export function getCachedDisplayUsername(address: string, compact = true): string | null {
  return cache.get(cacheKey(address, compact)) ?? null;
}
