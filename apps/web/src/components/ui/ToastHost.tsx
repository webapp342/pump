"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { getActiveToasts, subscribeToasts, toast, type ToastItem } from "@/lib/toast";

const MAX_VISIBLE = 3;
const TRADE_ACTIVITY_ID = "trade-activity";
const DISMISS_DISTANCE_PX = 56;
const DISMISS_VELOCITY = 0.45;

function toastPriority(item: ToastItem): number {
  if (item.id === TRADE_ACTIVITY_ID && item.tone === "loading") return 100;
  if (item.tone === "loading") return 80;
  if (item.tone === "error") return 60;
  return 40;
}

/** Newest first within the same priority — clean vertical stack (Sonner-style). */
function sortForDisplay(items: ToastItem[]): ToastItem[] {
  const newestFirst = [...items].reverse();
  return newestFirst
    .sort((a, b) => {
      const delta = toastPriority(b) - toastPriority(a);
      return delta !== 0 ? delta : 0;
    })
    .slice(0, MAX_VISIBLE);
}

function useDesktopToastSwipe(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return desktop;
}

function ToastItemCard({ item, desktopSwipe }: { item: ToastItem; desktopSwipe: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTs: 0,
    axis: null as "x" | "y" | null,
  });

  const resetTransform = useCallback((animate: boolean) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 180ms ease-out, opacity 180ms ease-out" : "none";
    el.style.transform = "translate3d(0,0,0)";
    el.style.opacity = "1";
  }, []);

  const dismissWithMotion = useCallback(
    (dx: number, dy: number) => {
      const el = cardRef.current;
      if (!el) return;
      const outX = desktopSwipe ? Math.max(dx, window.innerWidth * 0.35) : 0;
      const outY = desktopSwipe ? 0 : Math.min(dy, -120);
      el.style.transition = "transform 200ms ease-in, opacity 200ms ease-in";
      el.style.transform = `translate3d(${outX}px, ${outY}px, 0)`;
      el.style.opacity = "0";
      window.setTimeout(() => toast.dismiss(item.id), 180);
    },
    [desktopSwipe, item.id]
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as Element | null)?.closest?.("button, a")) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTs: event.timeStamp,
      axis: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    resetTransform(false);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.axis = desktopSwipe
        ? Math.abs(dx) >= Math.abs(dy)
          ? "x"
          : "y"
        : Math.abs(dy) >= Math.abs(dx)
          ? "y"
          : "x";
      if (desktopSwipe && drag.axis !== "x") {
        drag.active = false;
        resetTransform(true);
        return;
      }
      if (!desktopSwipe && drag.axis !== "y") {
        drag.active = false;
        resetTransform(true);
        return;
      }
    }

    const el = cardRef.current;
    if (!el) return;
    el.style.transition = "none";
    if (desktopSwipe) {
      const x = Math.max(0, dx);
      el.style.transform = `translate3d(${x}px, 0, 0)`;
      el.style.opacity = String(Math.max(0.35, 1 - x / 180));
    } else {
      const y = Math.min(0, dy);
      el.style.transform = `translate3d(0, ${y}px, 0)`;
      el.style.opacity = String(Math.max(0.35, 1 + y / 140));
    }

    const dt = Math.max(1, event.timeStamp - drag.lastTs);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTs = event.timeStamp;
    void dt;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const dt = Math.max(1, event.timeStamp - drag.lastTs);
    const vx = (event.clientX - drag.lastX) / dt;
    const vy = (event.clientY - drag.lastY) / dt;

    if (desktopSwipe) {
      if (dx > DISMISS_DISTANCE_PX || vx > DISMISS_VELOCITY) {
        dismissWithMotion(dx, 0);
        return;
      }
    } else if (dy < -DISMISS_DISTANCE_PX || vy < -DISMISS_VELOCITY) {
      dismissWithMotion(0, dy);
      return;
    }

    resetTransform(true);
  };

  return (
    <div
      ref={cardRef}
      className={`toast-item toast-item--${item.tone}`}
      role="status"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none" }}
    >
      <div className="toast-item__body">
        {item.tone === "loading" ? (
          <span className="toast-item__spinner" aria-hidden />
        ) : item.tone === "success" ? (
          <span className="toast-item__check" aria-hidden />
        ) : null}
        <div className="toast-item__copy">
          <p className="toast-item__title">{item.title}</p>
          {item.description ? <p className="toast-item__description">{item.description}</p> : null}
        </div>
      </div>
      <div className="toast-item__actions">
        {item.action ? (
          <a
            href={item.action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="toast-item__action"
          >
            {item.action.label}
          </a>
        ) : null}
        <button
          type="button"
          className="toast-item__close"
          aria-label="Dismiss notification"
          onClick={() => toast.dismiss(item.id)}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>(() => sortForDisplay(getActiveToasts()));
  const desktopSwipe = useDesktopToastSwipe();

  const syncFromStore = useCallback(() => {
    setItems(sortForDisplay(getActiveToasts()));
  }, []);

  useEffect(() => {
    syncFromStore();
    return subscribeToasts((event) => {
      if (event.type === "push" || event.type === "update") {
        syncFromStore();
        return;
      }
      if (event.type === "dismiss") {
        setItems((prev) => prev.filter((t) => t.id !== event.id));
      }
    });
  }, [syncFromStore]);

  if (items.length === 0) return null;

  return (
    <div className="toast-host" role="region" aria-live="polite" aria-label="Notifications">
      {items.map((item, index) => (
        <div key={item.id} style={{ zIndex: items.length - index }}>
          <ToastItemCard item={item} desktopSwipe={desktopSwipe} />
        </div>
      ))}
    </div>
  );
}
