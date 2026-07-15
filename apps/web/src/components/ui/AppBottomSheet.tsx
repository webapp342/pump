"use client";

import { useEffect, type ReactNode } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  useMobileModalClose,
  useMobileModalScrollLock,
} from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";
import { PumpIcon, faX } from "@/lib/icons";

type AppBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name when title is custom/hidden. */
  ariaLabel: string;
  title?: string;
  subtitle?: string;
  /** Optional leading node in the header (icon / back). */
  headerLeading?: ReactNode;
  /** Replace default title block. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Backdrop stacking — host is zIndex + 1. */
  zIndex?: number;
  panelClassName?: string;
  bodyClassName?: string;
  /** Hide default X; caller provides close elsewhere. */
  hideCloseButton?: boolean;
  /** When false, only the grab bar starts the swipe (safer for long scroll lists). */
  dragEntirePanel?: boolean;
};

/**
 * Mobile-first bottom sheet with springy swipe-to-dismiss (TradeSheet pattern).
 * On ≥sm, `.modal-sheet-host` centers the card.
 */
export function AppBottomSheet({
  open,
  onClose,
  ariaLabel,
  title,
  subtitle,
  headerLeading,
  header,
  footer,
  children,
  zIndex = 70,
  panelClassName = "",
  bodyClassName = "",
  hideCloseButton = false,
  dragEntirePanel = true,
}: AppBottomSheetProps) {
  const handleClose = useMobileModalClose(onClose);
  const { panelRef, sheetDragProps, gripProps, resetDrag } =
    useMobileSheetDragDismiss(handleClose);

  useMobileModalScrollLock(open);

  useEffect(() => {
    if (open) return;
    resetDrag();
  }, [open, resetDrag]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  const backdropZ = zIndex;
  const hostZ = zIndex + 1;

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss cursor-default transition-opacity"
          style={{ zIndex: backdropZ }}
          aria-label={`Close ${ariaLabel}`}
          onClick={handleClose}
        />
        <div
          className="modal-sheet-host"
          style={{ zIndex: hostZ }}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <div
            ref={panelRef}
            className={`app-bottom-sheet modal-panel modal-sheet-panel app-sheet-host-panel pointer-events-auto flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border-x-0 border-b-0 select-none sm:max-h-[min(85dvh,40rem)] sm:rounded-xl sm:border-x sm:border-b ${panelClassName}`.trim()}
            {...(dragEntirePanel ? sheetDragProps : undefined)}
          >
            <div
              className="app-bottom-sheet__grip-bar shrink-0 sm:hidden"
              aria-hidden
              {...(!dragEntirePanel ? gripProps : undefined)}
            >
              <div className="app-bottom-sheet__grip" />
            </div>

            {header != null || title ? (
              <div className="app-bottom-sheet__header shrink-0">
                {header ?? (
                  <>
                    <div className="app-bottom-sheet__header-main">
                      {headerLeading}
                      <div className="min-w-0">
                        {title ? <h2 className="app-bottom-sheet__title">{title}</h2> : null}
                        {subtitle ? (
                          <p className="app-bottom-sheet__subtitle">{subtitle}</p>
                        ) : null}
                      </div>
                    </div>
                    {!hideCloseButton ? (
                      <button
                        type="button"
                        onClick={handleClose}
                        className="app-bottom-sheet__close"
                        aria-label="Close"
                      >
                        <PumpIcon icon={faX} className="h-4 w-4" />
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            <div
              className={`app-bottom-sheet__body min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`.trim()}
              data-sheet-drag-lock={dragEntirePanel ? undefined : true}
            >
              {children}
            </div>

            {footer ? <div className="app-bottom-sheet__footer shrink-0">{footer}</div> : null}
          </div>
        </div>
      </>
    </ModalPortal>
  );
}
