"use client";

import { useEffect } from "react";

const MOBILE_MQ = "(max-width: 1023px)";

const SCROLL_RESET_SELECTORS = [
  ".token-page-content-slot",
  ".token-page-stack--main",
  "main.token-page-main",
  ".app-shell--token",
  ".modal-sheet-panel",
  ".modal-sheet-host",
] as const;

type BodySnapshot = {
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  scrollY: number;
};

let lockCount = 0;
let bodySnapshot: BodySnapshot | null = null;

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}

/** Reset scroll offsets after mobile keyboard + modal close (iOS Safari). */
export function releaseMobileViewportAfterKeyboard() {
  if (typeof window === "undefined") return;

  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }

  const reset = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    for (const selector of SCROLL_RESET_SELECTORS) {
      document.querySelectorAll(selector).forEach((node) => {
        if (node instanceof HTMLElement) {
          node.scrollTop = 0;
        }
      });
    }
  };

  reset();
  requestAnimationFrame(() => {
    reset();
    window.setTimeout(reset, 120);
  });
}

function captureBodySnapshot(): BodySnapshot {
  return {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
    scrollY: window.scrollY || document.documentElement.scrollTop || 0,
  };
}

function lockBodyScroll() {
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.overflow = "hidden";

  if (!isMobileViewport()) return;

  document.body.style.position = "fixed";
  document.body.style.top = scrollY > 0 ? `-${scrollY}px` : "0";
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScroll(snapshot: BodySnapshot) {
  document.body.style.overflow = snapshot.overflow;
  document.body.style.position = snapshot.position;
  document.body.style.top = snapshot.top;
  document.body.style.left = snapshot.left;
  document.body.style.right = snapshot.right;
  document.body.style.width = snapshot.width;

  if (snapshot.scrollY > 0) {
    window.scrollTo(0, snapshot.scrollY);
  }

  releaseMobileViewportAfterKeyboard();
}

function acquireMobileModalScrollLock(): () => void {
  if (lockCount === 0) {
    bodySnapshot = captureBodySnapshot();
    lockBodyScroll();
  }
  lockCount += 1;

  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0) return;

    const snapshot = bodySnapshot ?? captureBodySnapshot();
    bodySnapshot = null;
    unlockBodyScroll(snapshot);
  };
}

/** Ref-counted body scroll lock with iOS keyboard viewport restore on release. */
export function useMobileModalScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    return acquireMobileModalScrollLock();
  }, [open]);
}
