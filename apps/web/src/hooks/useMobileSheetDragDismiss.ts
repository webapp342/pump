"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const DISMISS_THRESHOLD_PX = 88;
const VELOCITY_DISMISS_PX_MS = 0.55;
const SETTLE_MS = 300;
const DISMISS_MS = 260;
/** iOS-like sheet spring */
const SPRING_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DRAG_LOCK_SELECTOR =
  "button, input, label, a, textarea, select, [data-sheet-drag-lock], [role='slider']";

type DragState = {
  active: boolean;
  startY: number;
  offsetY: number;
  pointerId: number | null;
  lastY: number;
  lastTs: number;
  velocity: number;
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

/** Soft resistance so long pulls feel rubbery (enterprise sheets). */
function resistPull(distance: number): number {
  if (distance <= 0) return 0;
  return distance / (1 + distance / 520);
}

export function useMobileSheetDragDismiss(onDismiss: () => void): UseMobileSheetDragDismissResult {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({
    active: false,
    startY: 0,
    offsetY: 0,
    pointerId: null,
    lastY: 0,
    lastTs: 0,
    velocity: 0,
  });
  const offsetRef = useRef(0);
  const draggingRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const applyOffset = useCallback((offsetY: number, animate: boolean, durationMs = SETTLE_MS) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.willChange = "transform";
    panel.style.transition = animate
      ? `transform ${durationMs}ms ${SPRING_EASE}`
      : "none";
    panel.style.transform = offsetY > 0.5 ? `translate3d(0, ${offsetY}px, 0)` : "";
  }, []);

  const resetDrag = useCallback(() => {
    clearDismissTimer();
    dragRef.current = {
      active: false,
      startY: 0,
      offsetY: 0,
      pointerId: null,
      lastY: 0,
      lastTs: 0,
      velocity: 0,
    };
    offsetRef.current = 0;
    draggingRef.current = false;
    applyOffset(0, false);
    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = "";
      panel.style.willChange = "";
    }
  }, [applyOffset, clearDismissTimer]);

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragRef.current;
      if (!state.active) return;

      const handle = event.currentTarget;
      if (state.pointerId != null && handle.hasPointerCapture(state.pointerId)) {
        handle.releasePointerCapture(state.pointerId);
      }

      const shouldDismiss =
        state.offsetY >= DISMISS_THRESHOLD_PX || state.velocity >= VELOCITY_DISMISS_PX_MS;

      dragRef.current = {
        active: false,
        startY: 0,
        offsetY: 0,
        pointerId: null,
        lastY: 0,
        lastTs: 0,
        velocity: 0,
      };
      draggingRef.current = false;

      if (shouldDismiss) {
        const exitDistance = Math.max(window.innerHeight * 0.55, state.offsetY + 160);
        applyOffset(exitDistance, true, DISMISS_MS);
        clearDismissTimer();
        dismissTimerRef.current = window.setTimeout(() => {
          resetDrag();
          onDismiss();
        }, DISMISS_MS);
        return;
      }

      applyOffset(0, true, SETTLE_MS);
      clearDismissTimer();
      dismissTimerRef.current = window.setTimeout(() => applyOffset(0, false), SETTLE_MS + 20);
    },
    [applyOffset, clearDismissTimer, onDismiss, resetDrag]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      clearDismissTimer();
      const now = performance.now();
      dragRef.current = {
        active: true,
        startY: event.clientY,
        offsetY: 0,
        pointerId: event.pointerId,
        lastY: event.clientY,
        lastTs: now,
        velocity: 0,
      };
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      applyOffset(0, false);
    },
    [applyOffset, clearDismissTimer]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragRef.current;
      if (!state.active || state.pointerId !== event.pointerId) return;

      const now = performance.now();
      const dt = Math.max(1, now - state.lastTs);
      const dy = event.clientY - state.lastY;
      state.velocity = dy / dt;
      state.lastY = event.clientY;
      state.lastTs = now;

      const raw = Math.max(0, event.clientY - state.startY);
      const offsetY = resistPull(raw);
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
