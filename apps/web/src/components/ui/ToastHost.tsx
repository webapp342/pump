"use client";

import { useEffect, useState } from "react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";

const MAX_VISIBLE = 5;

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts((item) => {
      setItems((prev) => [item, ...prev].slice(0, MAX_VISIBLE));
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, item.durationMs);
    });
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
          <p className="toast-item__title">{item.title}</p>
          {item.description ? (
            <p className="toast-item__description">{item.description}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
