"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const DISMISS_THRESHOLD_PX = 72;
const DRAG_LOCK_SELECTOR =
  "button, input, label, a, textarea, select, [data-sheet-drag-lock]";

type DragState = {
  active: boolean;
  startY: number;
  offsetY: number;
  pointerId: number | null;
};

export type MobileSheetGripProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
};

type UseMobileSheetDragDismissResult = {
  panelRef: RefObject<HTMLDivElement | null>;
  dragOffsetY: number;
  isDragging: boolean;
  /** Drag handle only (legacy). */
  gripProps: MobileSheetGripProps;
  /** Full-panel swipe-to-dismiss — skips buttons/inputs. */
  sheetDragProps: MobileSheetGripProps;
  resetDrag: () => void;
};

function isDragLockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(DRAG_LOCK_SELECTOR));
}

export function useMobileSheetDragDismiss(onDismiss: () => void): UseMobileSheetDragDismissResult {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({
    active: false,
    startY: 0,
    offsetY: 0,
    pointerId: null,
  });
  const offsetRef = useRef(0);
  const draggingRef = useRef(false);

  const applyOffset = useCallback((offsetY: number, animate: boolean) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = animate ? "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)" : "none";
    panel.style.transform = offsetY > 0 ? `translateY(${offsetY}px)` : "";
  }, []);

  const resetDrag = useCallback(() => {
    dragRef.current = { active: false, startY: 0, offsetY: 0, pointerId: null };
    offsetRef.current = 0;
    draggingRef.current = false;
    applyOffset(0, false);
    const panel = panelRef.current;
    if (panel) panel.style.transition = "";
  }, [applyOffset]);

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragRef.current;
      if (!state.active) return;

      const handle = event.currentTarget;
      if (state.pointerId != null && handle.hasPointerCapture(state.pointerId)) {
        handle.releasePointerCapture(state.pointerId);
      }

      const shouldDismiss = state.offsetY >= DISMISS_THRESHOLD_PX;
      dragRef.current = { active: false, startY: 0, offsetY: 0, pointerId: null };
      draggingRef.current = false;

      if (shouldDismiss) {
        applyOffset(window.innerHeight * 0.35, true);
        window.setTimeout(() => {
          resetDrag();
          onDismiss();
        }, 180);
        return;
      }

      applyOffset(0, true);
      window.setTimeout(() => applyOffset(0, false), 240);
    },
    [applyOffset, onDismiss, resetDrag]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      dragRef.current = {
        active: true,
        startY: event.clientY,
        offsetY: 0,
        pointerId: event.pointerId,
      };
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      applyOffset(0, false);
    },
    [applyOffset]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragRef.current;
      if (!state.active || state.pointerId !== event.pointerId) return;

      const offsetY = Math.max(0, event.clientY - state.startY);
      state.offsetY = offsetY;
      offsetRef.current = offsetY;
      applyOffset(offsetY, false);
    },
    [applyOffset]
  );

  const dragHandlers: MobileSheetGripProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
  };

  const onPanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (isDragLockedTarget(event.target)) return;
      onPointerDown(event);
    },
    [onPointerDown]
  );

  return {
    panelRef,
    dragOffsetY: offsetRef.current,
    isDragging: draggingRef.current,
    gripProps: dragHandlers,
    sheetDragProps: {
      onPointerDown: onPanelPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
    },
    resetDrag,
  };
}
