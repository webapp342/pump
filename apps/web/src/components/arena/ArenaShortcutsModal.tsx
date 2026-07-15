"use client";

import { AppBottomSheet } from "@/components/ui/AppBottomSheet";

type ArenaShortcutsModalProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS = [
  { keys: "/", description: "Focus search" },
  { keys: "?", description: "Show keyboard shortcuts" },
  { keys: "Esc", description: "Close this dialog" },
] as const;

export function ArenaShortcutsModal({ open, onClose }: ArenaShortcutsModalProps) {
  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Keyboard shortcuts"
      title="Keyboard shortcuts"
      subtitle="Desktop Arena only"
      zIndex={50}
      panelClassName="max-w-sm"
      footer={
        <button type="button" onClick={onClose} className="secondary-button w-full">
          Close
        </button>
      }
    >
          <ul className="space-y-2">
            {SHORTCUTS.map((shortcut) => (
              <li
                key={shortcut.keys}
                className="flex items-center justify-between gap-3 border border-pump-border/40 bg-pump-border/4 px-3 py-2"
              >
                <span className="text-body-sm text-pump-text">{shortcut.description}</span>
                <kbd className="financial-value rounded-sm border border-pump-border/50 bg-pump-card px-2 py-0.5 text-caption text-pump-muted">
                  {shortcut.keys}
                </kbd>
              </li>
            ))}
          </ul>
    </AppBottomSheet>
  );
}
