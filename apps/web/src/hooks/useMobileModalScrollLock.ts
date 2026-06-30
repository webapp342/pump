"use client";

import { useCallback, useEffect } from "react";

const MOBILE_MQ = "(max-width: 1023px)";

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
let viewportResizeHandler: (() => void) | null = null;

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}

function isTokenPageLockActive(): boolean {
  return document.documentElement.classList.contains("token-page-lock");
}

function blurActiveElement() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

function resetWindowViewportOnly() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  for (const selector of [
    "main.token-page-main",
    ".app-shell--token",
    ".token-page-grid",
    ".token-page-content-slot",
    ".token-page-stack--main",
    ".token-mobile-toolbar-host",
  ] as const) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) {
        node.scrollTop = 0;
      }
    });
  }
}

function resetViewportScroll() {
  resetWindowViewportOnly();

  for (const selector of [
    ".modal-sheet-host",
    ".modal-sheet-panel",
    ".token-mobile-market-sheet__body",
    ".token-market-sidebar__list",
  ] as const) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) {
        node.scrollTop = 0;
      }
    });
  }
}

/** Reset scroll offsets after mobile keyboard + modal close (iOS Safari). */
export function releaseMobileViewportAfterKeyboard() {
  if (typeof window === "undefined") return;

  blurActiveElement();

  const run = () => resetViewportScroll();

  run();
  requestAnimationFrame(() => {
    run();
    window.setTimeout(run, 120);
    window.setTimeout(run, 280);
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
  if (isTokenPageLockActive() && isMobileViewport()) {
    // Token detail already locks html/body; fixed body causes the page to jump.
    return;
  }

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

  if (snapshot.scrollY > 0 && !(isTokenPageLockActive() && isMobileViewport())) {
    window.scrollTo(0, snapshot.scrollY);
  }

  releaseMobileViewportAfterKeyboard();
}

function attachViewportResizeGuard() {
  if (!isMobileViewport() || viewportResizeHandler) return;

  viewportResizeHandler = () => {
    if (lockCount <= 0) return;
    requestAnimationFrame(() => {
      if (lockCount <= 0) return;
      resetWindowViewportOnly();
    });
  };

  window.visualViewport?.addEventListener("resize", viewportResizeHandler);
}

function detachViewportResizeGuard() {
  if (!viewportResizeHandler) return;
  window.visualViewport?.removeEventListener("resize", viewportResizeHandler);
  viewportResizeHandler = null;
}

function acquireMobileModalScrollLock(): () => void {
  if (lockCount === 0) {
    bodySnapshot = captureBodySnapshot();
    lockBodyScroll();
    attachViewportResizeGuard();
  }
  lockCount += 1;

  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0) return;

    detachViewportResizeGuard();
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

/** Call from modal close handlers for an extra iOS viewport settle pass. */
export function useMobileModalClose(onClose: () => void) {
  return useCallback(() => {
    blurActiveElement();
    onClose();
    releaseMobileViewportAfterKeyboard();
  }, [onClose]);
}
