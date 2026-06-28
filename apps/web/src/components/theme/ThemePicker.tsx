"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[1.125rem] w-[1.125rem] fill-none stroke-current">
      <circle cx="12" cy="12" r="4" strokeWidth="1.75" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[1.125rem] w-[1.125rem] fill-none stroke-current">
      <path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemePicker() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="toolbar-btn text-pump-muted"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** @deprecated Use ThemePicker */
export function ThemeToggle() {
  return <ThemePicker />;
}
