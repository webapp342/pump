"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getColorScheme,
  isValidTheme,
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
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const fromDom = document.documentElement.dataset.theme;
    const next = isValidTheme(stored)
      ? stored
      : isValidTheme(fromDom)
        ? fromDom
        : "dark";

    setThemeState(next);
    applyTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => {
        setThemeState(next);
        applyTheme(next);
      },
      toggleTheme: () => {
        setThemeState((current) => {
          const next = current === "dark" ? "light" : "dark";
          applyTheme(next);
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
