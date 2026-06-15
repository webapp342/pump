"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const ACTION_WIDTH = 92;
const SNAP_THRESHOLD = 44;
const PEEK_OFFSET = -28;
const SWIPE_HINT_KEY = "pump-holdings-swipe-hint";

export function isHoldingsSwipeHintDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SWIPE_HINT_KEY) === "1";
}

export function dismissHoldingsSwipeHint(): void {
  window.localStorage.setItem(SWIPE_HINT_KEY, "1");
}

type HoldingSwipeRowProps = {
  children: ReactNode;
  onBuyMax: () => void;
  onSellMax: () => void;
  disabled?: boolean;
  peekOnMount?: boolean;
};

export function HoldingSwipeRow({
  children,
  onBuyMax,
  onSellMax,
  disabled = false,
  peekOnMount = false,
}: HoldingSwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showEdgeHint, setShowEdgeHint] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axisLock = useRef<"x" | "y" | null>(null);
  const peekPlayedRef = useRef(false);

  const clamp = useCallback(
    (value: number) => Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, value)),
    []
  );

  const close = useCallback(() => setOffset(0), []);

  useEffect(() => {
    if (!peekOnMount || disabled || peekPlayedRef.current) return;
    if (isHoldingsSwipeHintDismissed()) return;

    peekPlayedRef.current = true;
    setShowEdgeHint(true);

    const startTimer = window.setTimeout(() => {
      setOffset(PEEK_OFFSET);
      window.setTimeout(() => setOffset(0), 420);
    }, 700);

    return () => window.clearTimeout(startTimer);
  }, [peekOnMount, disabled]);

  useEffect(() => {
    if (offset === 0 || isHoldingsSwipeHintDismissed()) {
      setShowEdgeHint(!isHoldingsSwipeHintDismissed());
      return;
    }
    setShowEdgeHint(false);
    dismissHoldingsSwipeHint();
  }, [offset]);

  const onTouchStart = (event: React.TouchEvent) => {
    if (disabled) return;
    startX.current = event.touches[0].clientX;
    startY.current = event.touches[0].clientY;
    startOffset.current = offset;
    axisLock.current = null;
    setDragging(true);
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (!dragging || disabled) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;

    if (axisLock.current == null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      axisLock.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }

    if (axisLock.current !== "x") return;

    if (Math.abs(deltaX) > 0 || startOffset.current !== 0) {
      event.preventDefault();
    }

    setOffset(clamp(startOffset.current + deltaX));
  };

  const onTouchEnd = () => {
    setDragging(false);
    axisLock.current = null;
    setOffset((current) => {
      if (current <= -SNAP_THRESHOLD) return -ACTION_WIDTH;
      if (current >= SNAP_THRESHOLD) return ACTION_WIDTH;
      return 0;
    });
  };

  return (
    <div className="relative overflow-hidden">
      {!disabled ? (
        <>
          <div className="absolute inset-y-0 left-0 flex w-[92px] items-stretch">
            <button
              type="button"
              onClick={() => {
                close();
                dismissHoldingsSwipeHint();
                onBuyMax();
              }}
              className="flex flex-1 items-center justify-center bg-pump-success px-2 text-center text-caption font-semibold leading-tight text-pump-accent-foreground"
            >
              Buy max
            </button>
          </div>
          <div className="absolute inset-y-0 right-0 flex w-[92px] items-stretch">
            <button
              type="button"
              onClick={() => {
                close();
                dismissHoldingsSwipeHint();
                onSellMax();
              }}
              className="flex flex-1 items-center justify-center bg-pump-danger px-2 text-center text-caption font-semibold leading-tight text-white"
            >
              Sell max
            </button>
          </div>
        </>
      ) : null}
      <div
        className={`relative bg-pump-card ${dragging ? "" : "transition-transform duration-200 ease-out"}`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {showEdgeHint && offset === 0 ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-pump-border/25 to-transparent"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-pump-border/25 to-transparent"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute left-1.5 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold text-pump-muted/70"
              aria-hidden
            >
              ›
            </span>
            <span
              className="pointer-events-none absolute right-1.5 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold text-pump-muted/70"
              aria-hidden
            >
              ‹
            </span>
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}
