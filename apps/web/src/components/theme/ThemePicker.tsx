"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { PumpIcon, faMoon, faSun } from "@/lib/icons";

type ThemePickerProps = {
  className?: string;
  /** Settings row: show "Dark" / "Light" text instead of a second sun/moon icon. */
  showLabel?: boolean;
};

export function ThemePicker({ className, showLabel = false }: ThemePickerProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const resolvedClass = className ?? "toolbar-btn text-pump-muted";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={resolvedClass}
    >
      {showLabel ? (
        <span className="wallet-account-panel__appearance-value">{isDark ? "Dark" : "Light"}</span>
      ) : isDark ? (
        <PumpIcon icon={faSun} className="app-header-utility-btn__glyph" />
      ) : (
        <PumpIcon icon={faMoon} className="app-header-utility-btn__glyph" />
      )}
    </button>
  );
}

/** @deprecated Use ThemePicker */
export function ThemeToggle() {
  return <ThemePicker />;
}
