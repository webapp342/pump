export const THEME_IDS = ["light", "dark", "navy", "slate"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_STORAGE_KEY = "pump-theme";

export const DEFAULT_THEME_ID: ThemeId = "slate";

export const THEME_LABELS: Record<ThemeId, string> = {
  light: "Classic Light",
  dark: "Classic Dark",
  navy: "Corporate Navy",
  slate: "Corporate Slate",
};

export const THEME_SWATCHES: Record<ThemeId, { bg: string; accent: string }> = {
  light: { bg: "#f7f8f6", accent: "#b84e38" },
  dark: { bg: "#121210", accent: "#cc9a4c" },
  navy: { bg: "#101c24", accent: "#38928c" },
  slate: { bg: "#eaefed", accent: "#1a767a" },
};

export function isValidTheme(value: string | null | undefined): value is ThemeId {
  return value === "light" || value === "dark" || value === "navy" || value === "slate";
}

export function isDarkTheme(theme: ThemeId): boolean {
  return theme === "dark" || theme === "navy";
}

export function getColorScheme(theme: ThemeId): "light" | "dark" {
  return isDarkTheme(theme) ? "dark" : "light";
}

export function getRainbowAccent(theme: ThemeId): { accentColor: string; accentColorForeground: string } {
  switch (theme) {
    case "navy":
      return { accentColor: "#38928c", accentColorForeground: "#f4fbf8" };
    case "slate":
      return { accentColor: "#1a767a", accentColorForeground: "#f7fcfb" };
    case "light":
      return { accentColor: "#b84e38", accentColorForeground: "#fffbf8" };
    default:
      return { accentColor: "#cc9a4c", accentColorForeground: "#121210" };
  }
}
