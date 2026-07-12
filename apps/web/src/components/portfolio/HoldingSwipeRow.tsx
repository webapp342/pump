"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const ACTION_WIDTH = 92;
const SNAP_THRESHOLD = 44;
const SWIPE_HINT_KEY = "pump-swipe-trade-hint";
const REVEAL_ACTIONS_OFFSET = 4;

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
  buyLabel?: string;
  sellLabel?: string;
  disabled?: boolean;
  peekOnMount?: boolean;
  dataBoardKey?: string;
  rowClassName?: string;
  contentClassName?: string;
};

export function HoldingSwipeRow({
  children,
  onBuyMax,
  onSellMax,
  buyLabel = "Buy max",
  sellLabel = "Sell max",
  disabled = false,
  peekOnMount = false,
  dataBoardKey,
  rowClassName = "",
  contentClassName = "bg-pump-bg",
}: HoldingSwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showEdgeHint, setShowEdgeHint] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axisLock = useRef<"x" | "y" | null>(null);
  const peekPlayedRef = useRef(false);
  const offsetRef = useRef(0);
  const touchActiveRef = useRef(false);
  const suppressClickRef = useRef(false);
  const draggingRef = useRef(false);

  const clamp = useCallback(
    (value: number) => Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, value)),
    []
  );

  const close = useCallback(() => setOffset(0), []);

  const triggerBuy = useCallback(() => {
    close();
    dismissHoldingsSwipeHint();
    onBuyMax();
  }, [close, onBuyMax]);

  const triggerSell = useCallback(() => {
    close();
    dismissHoldingsSwipeHint();
    onSellMax();
  }, [close, onSellMax]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    if (!peekOnMount || disabled || peekPlayedRef.current) return;
    if (isHoldingsSwipeHintDismissed()) return;

    peekPlayedRef.current = true;
    setShowEdgeHint(true);
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
    startOffset.current = offsetRef.current;
    axisLock.current = null;
    touchActiveRef.current = true;
    suppressClickRef.current = false;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (!touchActiveRef.current || disabled) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;

    if (axisLock.current == null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      axisLock.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      if (axisLock.current === "y") {
        touchActiveRef.current = false;
        return;
      }
    }

    if (axisLock.current !== "x") return;

    if (!draggingRef.current) {
      draggingRef.current = true;
      setDragging(true);
    }
    suppressClickRef.current = true;

    if (Math.abs(deltaX) > 0 || startOffset.current !== 0) {
      event.preventDefault();
    }

    setOffset(clamp(startOffset.current + deltaX));
  };

  const onTouchEnd = () => {
    touchActiveRef.current = false;

    if (!draggingRef.current) {
      axisLock.current = null;
      return;
    }

    draggingRef.current = false;
    setDragging(false);
    axisLock.current = null;
    const current = offsetRef.current;

    if (current <= -SNAP_THRESHOLD) {
      if (!disabled) triggerSell();
      setOffset(0);
      return;
    }
    if (current >= SNAP_THRESHOLD) {
      if (!disabled) triggerBuy();
      setOffset(0);
      return;
    }
    setOffset(0);
  };

  const onContentClickCapture = (event: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const revealActions = dragging || Math.abs(offset) >= REVEAL_ACTIONS_OFFSET;

  return (
    <div
      className={`relative overflow-hidden ${rowClassName}`.trim()}
      {...(dataBoardKey ? { "data-board-key": dataBoardKey } : {})}
    >
      {!disabled ? (
        <>
          <div
            className={`absolute inset-y-0 left-0 flex w-[92px] items-stretch transition-opacity duration-150 ${
              revealActions ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={triggerBuy}
              className="flex flex-1 items-center justify-center bg-pump-success px-2 text-center text-caption font-semibold leading-tight text-pump-accent-foreground"
            >
              {buyLabel}
            </button>
          </div>
          <div
            className={`absolute inset-y-0 right-0 flex w-[92px] items-stretch transition-opacity duration-150 ${
              revealActions ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={triggerSell}
              className="flex flex-1 items-center justify-center bg-pump-danger px-2 text-center text-caption font-semibold leading-tight text-white"
            >
              {sellLabel}
            </button>
          </div>
        </>
      ) : null}
      <div
        className={`relative z-[1] w-full min-h-full ${contentClassName} ${dragging ? "" : "transition-transform duration-200 ease-out"}`.trim()}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={onContentClickCapture}
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
