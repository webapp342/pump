export const THEME_IDS = ["light", "dark", "navy", "slate"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_STORAGE_KEY = "pump-theme";

export const THEME_LABELS: Record<ThemeId, string> = {
  light: "Classic Light",
  dark: "Classic Dark",
  navy: "Corporate Navy",
  slate: "Corporate Slate",
};

export const THEME_SWATCHES: Record<ThemeId, { bg: string; accent: string }> = {
  light: { bg: "#f2f6fb", accent: "#215cd6" },
  dark: { bg: "#09101c", accent: "#5e8bff" },
  navy: { bg: "#0a1628", accent: "#c9a227" },
  slate: { bg: "#f8f9fb", accent: "#0f766e" },
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
      return { accentColor: "#c9a227", accentColorForeground: "#0a1628" };
    case "slate":
      return { accentColor: "#0f766e", accentColorForeground: "#f0fdfa" };
    case "light":
      return { accentColor: "#215cd6", accentColorForeground: "#f5f8ff" };
    default:
      return { accentColor: "#5e8bff", accentColorForeground: "#f5f8ff" };
  }
}
