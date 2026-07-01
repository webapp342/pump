"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PumpIcon, faInfo } from "@/lib/icons";

type InfoTipProps = {
  /** Accessible name, e.g. "About Daily Swap" */
  label: string;
  children: ReactNode;
  className?: string;
};

type PanelPosition = {
  top: number;
  left: number;
  placement: "above" | "below";
};

const VIEWPORT_PAD = 12;
const GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function InfoTip({ label, children, className = "" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const hoverOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    hoverOpenRef.current = window.matchMedia("(hover: hover) and (min-width: 768px)").matches;
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = panelRect.width || Math.min(280, window.innerWidth - VIEWPORT_PAD * 2);
    const panelHeight = panelRect.height || 80;

    let placement: PanelPosition["placement"] = "below";
    let top = triggerRect.bottom + GAP;

    if (top + panelHeight > window.innerHeight - VIEWPORT_PAD) {
      placement = "above";
      top = triggerRect.top - panelHeight - GAP;
    }

    if (top < VIEWPORT_PAD) {
      placement = "below";
      top = triggerRect.bottom + GAP;
    }

    const idealLeft = triggerRect.left + triggerRect.width / 2 - panelWidth / 2;
    const left = clamp(idealLeft, VIEWPORT_PAD, window.innerWidth - panelWidth - VIEWPORT_PAD);

    setPosition({ top, left, placement });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition, children]);

  useEffect(() => {
    if (!open) return;

    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openTip = useCallback(() => setOpen(true), []);
  const closeTip = useCallback(() => setOpen(false), []);
  const toggleTip = useCallback(() => setOpen((value) => !value), []);

  const panel =
    open && mounted ? (
      <div
        ref={panelRef}
        id={panelId}
        role="tooltip"
        className={`info-tip__panel info-tip__panel--floating${
          position ? ` info-tip__panel--${position.placement}` : ""
        }`}
        style={
          position
            ? { top: `${position.top}px`, left: `${position.left}px` }
            : { visibility: "hidden" as const }
        }
      >
        {children}
      </div>
    ) : null;

  return (
    <span
      ref={rootRef}
      className={`info-tip${open ? " info-tip--open" : ""} ${className}`.trim()}
      onMouseEnter={() => {
        if (hoverOpenRef.current) openTip();
      }}
      onMouseLeave={() => {
        if (hoverOpenRef.current) closeTip();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="info-tip__trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(event) => {
          event.stopPropagation();
          toggleTip();
        }}
        onFocus={() => {
          if (hoverOpenRef.current) openTip();
        }}
        onBlur={(event) => {
          if (!hoverOpenRef.current) return;
          const next = event.relatedTarget as Node | null;
          if (!rootRef.current?.contains(next) && !panelRef.current?.contains(next)) {
            closeTip();
          }
        }}
      >
        <PumpIcon icon={faInfo} className="h-3.5 w-3.5" aria-hidden />
      </button>
      {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </span>
  );
}
