"use client";

import { useCallback, useEffect, useRef } from "react";

/** Coalesce high-frequency WS messages into one flush per animation frame. */
export function useRafMessageQueue<T>(flush: (messages: T[]) => void) {
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const queueRef = useRef<T[]>([]);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      queueRef.current = [];
    };
  }, []);

  return useCallback((message: T) => {
    queueRef.current.push(message);
    if (frameRef.current != null) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const batch = queueRef.current;
      queueRef.current = [];
      if (batch.length > 0) {
        flushRef.current(batch);
      }
    });
  }, []);
}
