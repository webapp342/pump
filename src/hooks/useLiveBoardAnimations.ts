"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export type RankShift = "up" | "down";

type BoardAnimState = {
  landing: Set<string>;
  rankShift: Record<string, RankShift>;
};

const LAND_MS = 720;
const RANK_MS = 900;

function emptyState(): BoardAnimState {
  return { landing: new Set(), rankShift: {} };
}

/**
 * Tracks new list entries and rank shifts for pump-style board animations.
 * Optionally runs FLIP layout transitions on a container ref (mobile list).
 */
export function useLiveBoardAnimations(
  orderedKeys: string[],
  options?: {
    flipContainerRef?: RefObject<HTMLElement | null>;
    /** When this changes (filter/sort/search), rank tracking resets without animating. */
    resetKey?: string;
  }
) {
  const prevKeysRef = useRef<string[] | null>(null);
  const prevRankRef = useRef<Map<string, number>>(new Map());
  const globallySeenRef = useRef<Set<string>>(new Set());
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const resetKeyRef = useRef(options?.resetKey);
  const [anim, setAnim] = useState<BoardAnimState>(emptyState);
  const initializedRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  useLayoutEffect(() => {
    if (options?.resetKey !== resetKeyRef.current) {
      resetKeyRef.current = options?.resetKey;
      prevKeysRef.current = orderedKeys;
      const rankMap = new Map<string, number>();
      orderedKeys.forEach((key, index) => rankMap.set(key, index));
      prevRankRef.current = rankMap;
      positionsRef.current = new Map();
      for (const key of orderedKeys) globallySeenRef.current.add(key);
      return;
    }

    const prevKeys = prevKeysRef.current;
    const prevRank = prevRankRef.current;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevKeysRef.current = orderedKeys;
      const rankMap = new Map<string, number>();
      orderedKeys.forEach((key, index) => rankMap.set(key, index));
      prevRankRef.current = rankMap;
      for (const key of orderedKeys) globallySeenRef.current.add(key);
      return;
    }

    const prevKeySet = new Set(prevKeys ?? []);
    const nextLanding = new Set<string>();
    const nextRankShift: Record<string, RankShift> = {};

    orderedKeys.forEach((key, index) => {
      if (!globallySeenRef.current.has(key)) {
        nextLanding.add(key);
        globallySeenRef.current.add(key);
      } else if (!prevKeySet.has(key)) {
        // Re-entered current view (e.g. filter) — no land animation.
      } else {
        const oldIndex = prevRank.get(key);
        if (oldIndex != null && oldIndex !== index) {
          nextRankShift[key] = index < oldIndex ? "up" : "down";
        }
      }
    });

    const hasChanges = nextLanding.size > 0 || Object.keys(nextRankShift).length > 0;

    if (hasChanges) {
      setAnim({ landing: nextLanding, rankShift: nextRankShift });
      clearTimers();

      timersRef.current.push(
        setTimeout(() => {
          setAnim(emptyState());
        }, Math.max(LAND_MS, RANK_MS))
      );
    }

    const container = options?.flipContainerRef?.current;
    if (container && orderedKeys.length > 0) {
      const nextPositions = new Map<string, DOMRect>();
      for (const key of orderedKeys) {
        const el = container.querySelector(`[data-board-key="${key}"]`);
        if (el) nextPositions.set(key, el.getBoundingClientRect());
      }

      for (const key of orderedKeys) {
        const el = container.querySelector(`[data-board-key="${key}"]`) as HTMLElement | null;
        if (!el) continue;

        const prevRect = positionsRef.current.get(key);
        const nextRect = nextPositions.get(key);
        if (!prevRect || !nextRect) continue;

        const deltaY = prevRect.top - nextRect.top;
        if (Math.abs(deltaY) < 2) continue;

        el.style.transform = `translateY(${deltaY}px)`;
        el.style.transition = "none";
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
        });
      }

      positionsRef.current = nextPositions;
    }

    prevKeysRef.current = orderedKeys;
    const rankMap = new Map<string, number>();
    orderedKeys.forEach((key, index) => rankMap.set(key, index));
    prevRankRef.current = rankMap;
  }, [orderedKeys, options?.flipContainerRef, options?.resetKey, clearTimers]);

  useLayoutEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const rowClass = useCallback(
    (key: string) => {
      const classes: string[] = [];
      if (anim.landing.has(key)) classes.push("live-land-in");
      const shift = anim.rankShift[key];
      if (shift === "up") classes.push("live-rank-up");
      if (shift === "down") classes.push("live-rank-down");
      return classes.join(" ");
    },
    [anim]
  );

  const rankClass = useCallback(
    (key: string) => {
      const shift = anim.rankShift[key];
      if (shift === "up") return "live-rank-badge-up";
      if (shift === "down") return "live-rank-badge-down";
      return "";
    },
    [anim]
  );

  return { rowClass, rankClass };
}
