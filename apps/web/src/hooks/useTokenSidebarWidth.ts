"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

export const TOKEN_SIDEBAR_WIDTH_MIN = 312;
export const TOKEN_SIDEBAR_WIDTH_EXPAND_RATIO = 0.2;
export const TOKEN_SIDEBAR_COMPACT_MAX = 340;

export type TokenSidebarDensity = "compact" | "full";

export function tokenSidebarDensity(width: number): TokenSidebarDensity {
  if (width <= TOKEN_SIDEBAR_COMPACT_MAX) return "compact";
  return "full";
}

function readSidebarWidth(): number {
  if (typeof window === "undefined") return TOKEN_SIDEBAR_WIDTH_MIN;
  return Math.max(
    TOKEN_SIDEBAR_WIDTH_MIN,
    Math.round(window.innerWidth * TOKEN_SIDEBAR_WIDTH_EXPAND_RATIO)
  );
}

export function useTokenSidebarWidth() {
  const [sidebarWidth, setSidebarWidth] = useState(TOKEN_SIDEBAR_WIDTH_MIN);

  useEffect(() => {
    const update = () => setSidebarWidth(readSidebarWidth());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const gridStyle = useMemo(
    () =>
      ({
        "--token-sidebar-width": `${sidebarWidth}px`,
      }) as CSSProperties,
    [sidebarWidth]
  );

  return {
    sidebarWidth,
    gridStyle,
  };
}
