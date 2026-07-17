"use client";

import { useCallback, useEffect, useState } from "react";

let sharedByToken: Record<string, string> = {};
let sharedListeners = new Set<() => void>();
let sharedInflight: Promise<void> | null = null;
let sharedFetchedAt = 0;

const STALE_MS = 30_000;

function notifyListeners() {
  for (const listener of sharedListeners) listener();
}

async function fetchLaunchPins(force = false): Promise<void> {
  if (!force && sharedFetchedAt > 0 && Date.now() - sharedFetchedAt < STALE_MS) {
    return;
  }
  if (sharedInflight) {
    await sharedInflight;
    return;
  }

  sharedInflight = (async () => {
    try {
      const response = await fetch("/api/missions/launch-pins", { cache: "no-store" });
      const body = (await response.json()) as {
        byToken?: Record<string, string>;
      };
      if (response.ok) {
        sharedByToken = body.byToken ?? {};
        sharedFetchedAt = Date.now();
        notifyListeners();
      }
    } catch {
      // keep last good map
    } finally {
      sharedInflight = null;
    }
  })();

  await sharedInflight;
}

/** Shared active Launch spotlight pins (token → expiresAt ISO). */
export function useLaunchSpotlightPins() {
  const [byToken, setByToken] = useState<Record<string, string>>(sharedByToken);
  const [loading, setLoading] = useState(sharedFetchedAt === 0);

  useEffect(() => {
    const listener = () => setByToken({ ...sharedByToken });
    sharedListeners.add(listener);
    setLoading(true);
    void fetchLaunchPins().finally(() => {
      setByToken({ ...sharedByToken });
      setLoading(false);
    });
    const timer = window.setInterval(() => {
      void fetchLaunchPins();
    }, STALE_MS);
    return () => {
      sharedListeners.delete(listener);
      window.clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchLaunchPins(true).finally(() => {
      setByToken({ ...sharedByToken });
      setLoading(false);
    });
  }, []);

  return { byToken, loading, refresh };
}

export function sortTokensWithSpotlightFirst<T extends { address: string }>(
  tokens: T[],
  byToken: Record<string, string>
): T[] {
  if (!tokens.length || Object.keys(byToken).length === 0) return tokens;
  const now = Date.now();
  return [...tokens].sort((a, b) => {
    const aExp = byToken[a.address.toLowerCase()];
    const bExp = byToken[b.address.toLowerCase()];
    const aPinned = aExp != null && new Date(aExp).getTime() > now ? 0 : 1;
    const bPinned = bExp != null && new Date(bExp).getTime() > now ? 0 : 1;
    return aPinned - bPinned;
  });
}

export function isTokenSpotlightPinned(
  address: string,
  byToken: Record<string, string>
): boolean {
  const exp = byToken[address.toLowerCase()];
  if (!exp) return false;
  return new Date(exp).getTime() > Date.now();
}
