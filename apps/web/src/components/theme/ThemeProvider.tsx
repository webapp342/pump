"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getColorScheme,
  getStoredThemePreference,
  isValidTheme,
  resolveSystemTheme,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ThemeId,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = getColorScheme(theme);
}

function persistTheme(theme: ThemeId) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private browsing */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => resolveThemePreference());

  useEffect(() => {
    const stored = getStoredThemePreference();
    const fromDom = document.documentElement.dataset.theme;
    const next = stored ?? (isValidTheme(fromDom) ? fromDom : resolveSystemTheme());

    setThemeState(next);
    applyTheme(next);

    if (stored) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange(event: MediaQueryListEvent) {
      if (getStoredThemePreference()) return;
      const resolved = event.matches ? "dark" : "light";
      setThemeState(resolved);
      applyTheme(resolved);
    }

    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => {
        setThemeState(next);
        applyTheme(next);
        persistTheme(next);
      },
      toggleTheme: () => {
        setThemeState((current) => {
          const next = current === "dark" ? "light" : "dark";
          applyTheme(next);
          persistTheme(next);
          return next;
        });
      },
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
