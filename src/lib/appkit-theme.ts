import { getColorScheme, getRainbowAccent, type ThemeId } from "@/lib/theme";

export function getAppKitThemeOptions(themeId: ThemeId) {
  const { accentColor } = getRainbowAccent(themeId);

  return {
    themeMode: getColorScheme(themeId),
    themeVariables: {
      "--apkt-accent": accentColor,
      "--apkt-color-mix": accentColor,
      "--apkt-color-mix-strength": 28,
      "--apkt-border-radius-master": "6px",
      "--apkt-font-family":
        'var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  } as const;
}
