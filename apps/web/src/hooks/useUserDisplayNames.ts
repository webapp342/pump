"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveDisplayUsername } from "@/lib/username";

type DisplayMeta = {
  label: string;
  hasStatusBadge: boolean;
};

const cache = new Map<string, DisplayMeta>();

function cacheKey(address: string, compact: boolean): string {
  return `${address.toLowerCase()}:${compact ? "1" : "0"}`;
}

async function fetchDisplayMeta(
  addresses: string[],
  compact: boolean
): Promise<Record<string, DisplayMeta>> {
  if (addresses.length === 0) return {};
  const response = await fetch(
    `/api/user/display-names?addresses=${encodeURIComponent(addresses.join(","))}&compact=${compact ? "1" : "0"}`,
    { cache: "no-store" }
  );
  const body = (await response.json()) as {
    data?: {
      displayNames?: Record<string, string>;
      statusBadges?: Record<string, boolean>;
    };
  };
  if (!response.ok || !body.data?.displayNames) {
    throw new Error("Failed to load display names");
  }
  const out: Record<string, DisplayMeta> = {};
  for (const [address, label] of Object.entries(body.data.displayNames)) {
    const key = address.toLowerCase();
    out[key] = {
      label,
      hasStatusBadge: Boolean(body.data.statusBadges?.[key]),
    };
  }
  return out;
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
        const metas = await fetchDisplayMeta(missing, compact);
        if (cancelled) return;
        for (const [address, meta] of Object.entries(metas)) {
          cache.set(cacheKey(address, compact), meta);
        }
        setVersion((value) => value + 1);
      } catch {
        for (const address of missing) {
          cache.set(cacheKey(address, compact), {
            label: resolveDisplayUsername(address, null, compact),
            hasStatusBadge: false,
          });
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
    const lookup = new Map<string, DisplayMeta>();
    for (const address of normalized) {
      lookup.set(
        address,
        cache.get(cacheKey(address, compact)) ?? {
          label: resolveDisplayUsername(address, null, compact),
          hasStatusBadge: false,
        }
      );
    }
    return lookup;
  }, [compact, normalized, version]);
}

/** @deprecated Prefer useUserDisplayNames meta — kept for call sites that only need the label. */
export function getCachedDisplayUsername(address: string, compact = true): string | null {
  return cache.get(cacheKey(address, compact))?.label ?? null;
}

export function getCachedStatusBadge(address: string, compact = true): boolean {
  return cache.get(cacheKey(address, compact))?.hasStatusBadge ?? false;
}

/** Drop cached identity so badge/name refresh after redeem. */
export function invalidateDisplayNameCache(address?: string): void {
  if (!address) {
    cache.clear();
    return;
  }
  const key = address.toLowerCase();
  for (const entry of [...cache.keys()]) {
    if (entry.startsWith(`${key}:`)) cache.delete(entry);
  }
}
