"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

export const TOKEN_SIDEBAR_WIDTH_MIN = 312;
export const TOKEN_SIDEBAR_WIDTH_EXPAND_RATIO = 0.2;
export const TOKEN_SIDEBAR_COMPACT_MAX = 340;

export type TokenSidebarDensity = "compact" | "full";

export function tokenSidebarDensity(width: number): TokenSidebarDensity {
  if (width <= TOKEN_SIDEBAR_COMPACT_MAX) return "compact";
  return "full";
}

const TOKEN_SIDEBAR_EXPANDED_STORAGE_KEY = "pump-token-market-sidebar-expanded";
const TOKEN_SIDEBAR_LEGACY_WIDTH_KEY = "pump-token-market-sidebar-width";

function readExpandedWidth(): number {
  if (typeof window === "undefined") return TOKEN_SIDEBAR_WIDTH_MIN;
  return Math.max(
    TOKEN_SIDEBAR_WIDTH_MIN,
    Math.round(window.innerWidth * TOKEN_SIDEBAR_WIDTH_EXPAND_RATIO)
  );
}

function readStoredExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(TOKEN_SIDEBAR_EXPANDED_STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;

    const legacy = localStorage.getItem(TOKEN_SIDEBAR_LEGACY_WIDTH_KEY);
    if (legacy) {
      const parsed = Number(legacy);
      if (Number.isFinite(parsed)) {
        return parsed > TOKEN_SIDEBAR_WIDTH_MIN;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function useTokenSidebarWidth() {
  const [expanded, setExpanded] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState(TOKEN_SIDEBAR_WIDTH_MIN);

  useEffect(() => {
    setExpanded(readStoredExpanded());
    setExpandedWidth(readExpandedWidth());

    const onResize = () => setExpandedWidth(readExpandedWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TOKEN_SIDEBAR_EXPANDED_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  }, []);

  const sidebarWidth = expanded ? expandedWidth : TOKEN_SIDEBAR_WIDTH_MIN;

  const gridStyle = useMemo(
    () =>
      ({
        "--token-sidebar-width": `${sidebarWidth}px`,
      }) as CSSProperties,
    [sidebarWidth]
  );

  return {
    expanded,
    sidebarWidth,
    toggleExpanded,
    gridStyle,
  };
}
