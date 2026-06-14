"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { THEME_IDS, THEME_LABELS, THEME_SWATCHES, type ThemeId } from "@/lib/theme";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-3.5 w-3.5 fill-none stroke-current transition ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeSwatch({ themeId }: { themeId: ThemeId }) {
  const swatch = THEME_SWATCHES[themeId];
  return (
    <span
      className="inline-flex h-3.5 w-3.5 shrink-0 overflow-hidden border border-pump-border/45"
      aria-hidden
    >
      <span className="h-full w-1/2" style={{ backgroundColor: swatch.bg }} />
      <span className="h-full w-1/2" style={{ backgroundColor: swatch.accent }} />
    </span>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Theme: ${THEME_LABELS[theme]}. Choose theme`}
        title={`Theme: ${THEME_LABELS[theme]}`}
        className="toolbar-btn text-pump-muted"
      >
        <ThemeSwatch themeId={theme} />
        <span className="hidden max-w-[7rem] truncate sm:inline">{THEME_LABELS[theme]}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Choose theme"
          className="absolute right-0 top-[calc(100%+4px)] z-[60] w-[min(14rem,calc(100vw-2rem))] border border-pump-border/50 bg-pump-card p-1"
        >
          {THEME_IDS.map((themeId) => {
            const active = themeId === theme;
            return (
              <button
                key={themeId}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setTheme(themeId);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-body-sm transition ${
                  active
                    ? "bg-pump-accent/12 font-semibold text-pump-text"
                    : "font-medium text-pump-muted hover:bg-pump-border/8 hover:text-pump-text"
                }`}
              >
                <ThemeSwatch themeId={themeId} />
                <span className="flex-1">{THEME_LABELS[themeId]}</span>
                {active ? (
                  <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 stroke-pump-accent fill-none">
                    <path d="M5 12l5 5L20 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use ThemePicker */
export function ThemeToggle() {
  return <ThemePicker />;
}
