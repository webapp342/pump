"use client";

import type { ReactNode } from "react";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { PumpIcon, faX } from "@/lib/icons";

type ToolbarSheetProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  title: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
};

export function ToolbarSheet({
  open,
  onClose,
  ariaLabel,
  title,
  icon,
  count,
  children,
}: ToolbarSheetProps) {
  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={ariaLabel}
      title={title}
      zIndex={50}
      panelClassName="toolbar-sheet max-h-[min(80vh,32rem)] max-w-lg"
      bodyClassName="toolbar-sheet-body !p-0"
      dragEntirePanel={false}
      header={
        <>
            <div className="toolbar-sheet-header__title">
              <span className="toolbar-sheet-header__icon" aria-hidden>
                {icon}
              </span>
              <h2 className="toolbar-sheet-header__label">{title}</h2>
              {count != null && count > 0 ? (
                <span className="toolbar-sheet-header__count financial-value">({count})</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="toolbar-sheet-header__close"
              aria-label="Close"
            >
              <PumpIcon icon={faX} className="h-4 w-4" />
            </button>
        </>
      }
    >
      {children}
    </AppBottomSheet>
  );
}
