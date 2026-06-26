"use client";

import { useCallback, useEffect, useState } from "react";
import { getActiveToasts, subscribeToasts, toast, type ToastItem } from "@/lib/toast";

const MAX_VISIBLE = 4;
const TRADE_ACTIVITY_ID = "trade-activity";

function toastPriority(item: ToastItem): number {
  if (item.id === TRADE_ACTIVITY_ID && item.tone === "loading") return 100;
  if (item.tone === "loading") return 80;
  if (item.tone === "error") return 60;
  return 40;
}

function sortForDisplay(items: ToastItem[]): ToastItem[] {
  return [...items].sort((a, b) => toastPriority(b) - toastPriority(a)).slice(0, MAX_VISIBLE);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>(() => sortForDisplay(getActiveToasts()));

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
            ) : item.tone === "success" ? (
              <span className="toast-item__check" aria-hidden />
            ) : null}
            <div className="toast-item__copy">
              <p className="toast-item__title">{item.title}</p>
              {item.description ? (
                <p className="toast-item__description">{item.description}</p>
              ) : null}
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
      ))}
    </div>
  );
}
