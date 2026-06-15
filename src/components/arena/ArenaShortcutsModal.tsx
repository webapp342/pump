"use client";

import { ModalPortal } from "@/components/ui/ModalPortal";

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
    <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arena-shortcuts-title"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="modal-panel relative w-full max-w-sm p-4 sm:p-5">
          <h2 id="arena-shortcuts-title" className="section-heading">
            Keyboard shortcuts
          </h2>
          <p className="mt-1 text-caption text-pump-muted">Desktop Arena only</p>
          <ul className="mt-4 space-y-2">
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
          <button type="button" onClick={onClose} className="secondary-button mt-4 w-full">
            Close
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
