"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const STORAGE_KEY = "pump-token-chart-pane-ratio";
/** Default chart share of the content column (chart + handle + trades). */
const DEFAULT_RATIO = 0.55;
/** Chart may collapse fully; leave room for trades when maximizing chart. */
const MIN_TAPE_PX = 120;
const HANDLE_PX = 10;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readStoredRatio(): number {
  if (typeof window === "undefined") return DEFAULT_RATIO;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_RATIO;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_RATIO;
    return clamp(n, 0, 1);
  } catch {
    return DEFAULT_RATIO;
  }
}

function writeStoredRatio(ratio: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clamp(ratio, 0, 1)));
  } catch {
    /* ignore quota / private mode */
  }
}

function ratioFromPointerY(clientY: number, container: HTMLElement): number {
  const rect = container.getBoundingClientRect();
  const usable = Math.max(0, rect.height - HANDLE_PX);
  if (usable <= 0) return 0;
  const maxChart = Math.max(0, usable - MIN_TAPE_PX);
  const raw = clientY - rect.top;
  return clamp(raw / usable, 0, maxChart / usable);
}

export type TokenChartTapeSplit = {
  contentRef: RefObject<HTMLDivElement | null>;
  contentStyle: CSSProperties;
  chartCollapsed: boolean;
  handleProps: {
    role: "separator";
    "aria-orientation": "horizontal";
    "aria-label": string;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-valuenow": number;
    tabIndex: number;
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
    onDoubleClick: () => void;
  };
};

/** Vertical split: chart above trades — chart can collapse to 0; trades grow. */
export function useTokenChartTapeSplit(): TokenChartTapeSplit {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [chartPx, setChartPx] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;

  useEffect(() => {
    setRatio(readStoredRatio());
  }, []);

  const applyLayout = useCallback((nextRatio: number) => {
    const el = contentRef.current;
    if (!el) return;
    const usable = Math.max(0, el.clientHeight - HANDLE_PX);
    const maxChart = Math.max(0, usable - MIN_TAPE_PX);
    const px = clamp(Math.round(nextRatio * usable), 0, maxChart);
    setChartPx(px);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const sync = () => applyLayout(ratioRef.current);
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyLayout, ratio]);

  const setRatioPersist = useCallback(
    (next: number) => {
      const clamped = clamp(next, 0, 1);
      setRatio(clamped);
      writeStoredRatio(clamped);
      applyLayout(clamped);
    },
    [applyLayout]
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    document.body.classList.remove("token-page-split-dragging");
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const el = contentRef.current;
    if (!el) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("token-page-split-dragging");
    setRatioPersist(ratioFromPointerY(event.clientY, el));
  }, [setRatioPersist]);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const el = contentRef.current;
      if (!el) return;
      setRatioPersist(ratioFromPointerY(event.clientY, el));
    },
    [setRatioPersist]
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 0.1 : 0.05;
      if (event.key === "ArrowUp" || event.key === "Home") {
        event.preventDefault();
        setRatioPersist(event.key === "Home" ? 0 : ratioRef.current - step);
      } else if (event.key === "ArrowDown" || event.key === "End") {
        event.preventDefault();
        setRatioPersist(event.key === "End" ? 1 : ratioRef.current + step);
      }
    },
    [setRatioPersist]
  );

  const onDoubleClick = useCallback(() => {
    setRatioPersist(ratioRef.current < 0.08 ? DEFAULT_RATIO : 0);
  }, [setRatioPersist]);

  const contentStyle: CSSProperties =
    chartPx == null
      ? { ["--token-chart-pane-height" as string]: `${DEFAULT_RATIO * 100}%` }
      : { ["--token-chart-pane-height" as string]: `${chartPx}px` };

  return {
    contentRef,
    contentStyle,
    chartCollapsed: chartPx === 0,
    handleProps: {
      role: "separator",
      "aria-orientation": "horizontal",
      "aria-label": "Resize chart and trades",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": Math.round(ratio * 100),
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
      onDoubleClick,
    },
  };
}
