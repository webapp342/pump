"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";

const MAX_VISIBLE = 8;
const TRADE_ORDER_PREFIX = "trade-order-";

function toastPriority(item: ToastItem): number {
  if (item.id.startsWith(TRADE_ORDER_PREFIX) && item.tone === "loading") return 100;
  if (item.tone === "loading") return 80;
  if (item.tone === "error") return 60;
  return 40;
}

function trimVisible(items: ToastItem[]): ToastItem[] {
  if (items.length <= MAX_VISIBLE) return items;
  const ranked = [...items].sort((a, b) => toastPriority(b) - toastPriority(a));
  return ranked.slice(0, MAX_VISIBLE);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (item: ToastItem) => {
      clearTimer(item.id);
      if (item.persistent || item.durationMs <= 0) return;
      const timer = window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
        timersRef.current.delete(item.id);
      }, item.durationMs);
      timersRef.current.set(item.id, timer);
    },
    [clearTimer]
  );

  useEffect(() => {
    return subscribeToasts((event) => {
      if (event.type === "push") {
        setItems((prev) => {
          const next = [event.item, ...prev.filter((t) => t.id !== event.item.id)];
          return trimVisible(next);
        });
        scheduleDismiss(event.item);
        return;
      }

      if (event.type === "update") {
        let mergedForTimer: ToastItem | null = null;
        setItems((prev) => {
          const existing = prev.find((t) => t.id === event.id);
          const merged: ToastItem = existing
            ? { ...existing, ...event.patch }
            : {
                id: event.id,
                tone: event.patch.tone ?? "info",
                title: event.patch.title ?? "",
                description: event.patch.description,
                durationMs: event.patch.durationMs ?? 4_000,
                persistent: event.patch.persistent,
                action: event.patch.action,
              };
          mergedForTimer = merged;
          const next = existing
            ? prev.map((t) => (t.id === event.id ? merged : t))
            : [merged, ...prev];
          return trimVisible(next);
        });
        if (mergedForTimer) scheduleDismiss(mergedForTimer);
        return;
      }

      if (event.type === "dismiss") {
        clearTimer(event.id);
        setItems((prev) => prev.filter((t) => t.id !== event.id));
      }
    });
  }, [clearTimer, scheduleDismiss]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="toast-host"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-item toast-item--${item.tone}`}
          role="status"
        >
          <div className="toast-item__body">
            {item.tone === "loading" ? (
              <span className="toast-item__spinner" aria-hidden />
            ) : null}
            <div className="toast-item__copy">
              <p className="toast-item__title">{item.title}</p>
              {item.description ? (
                <p className="toast-item__description">{item.description}</p>
              ) : null}
            </div>
          </div>
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
        </div>
      ))}
    </div>
  );
}
