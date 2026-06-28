export const THEME_IDS = ["light", "dark"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_STORAGE_KEY = "pump-theme";

/** Fallback when system preference cannot be read. */
export const DEFAULT_THEME_ID: ThemeId = "dark";

export function isValidTheme(value: string | null | undefined): value is ThemeId {
  return value === "light" || value === "dark";
}

export function isDarkTheme(theme: ThemeId): boolean {
  return theme === "dark";
}

export function getColorScheme(theme: ThemeId): "light" | "dark" {
  return theme === "dark" ? "dark" : "light";
}

/** Coinbase CDS defaultTheme — prefers-color-scheme with dark fallback. */
export function resolveSystemTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {
    /* matchMedia unavailable */
  }
  return DEFAULT_THEME_ID;
}

export function getStoredThemePreference(): ThemeId | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function resolveThemePreference(): ThemeId {
  return getStoredThemePreference() ?? resolveSystemTheme();
}

export function getRainbowAccent(theme: ThemeId): { accentColor: string; accentColorForeground: string } {
  if (theme === "light") {
    return { accentColor: "#0052ff", accentColorForeground: "#ffffff" };
  }
  return { accentColor: "#578bfa", accentColorForeground: "#ffffff" };
}
