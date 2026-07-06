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

const TOKEN_PAGE_SCROLL_SELECTORS = [
  "main.token-page-main",
  ".app-shell--token",
  ".token-page-grid",
  ".token-page-content-slot",
  ".token-page-stack--main",
  ".token-mobile-toolbar-host",
] as const;

const MODAL_SCROLL_SELECTORS = [
  ".modal-sheet-host",
  ".modal-sheet-panel",
  ".token-mobile-market-sheet__body",
  ".token-market-sidebar__list",
] as const;

function resetScrollContainers(selectors: readonly string[]) {
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) {
        node.scrollTop = 0;
      }
    });
  }
}

function isHubDiscoveryLockActive(): boolean {
  return document.documentElement.classList.contains("hub-discovery-scroll-lock");
}

function shouldPreserveTokenPageInnerScroll(): boolean {
  return isTokenPageLockActive() && isMobileViewport();
}

function shouldSkipFixedBodyScrollLock(): boolean {
  if (!isMobileViewport()) return false;
  return isTokenPageLockActive() || isHubDiscoveryLockActive();
}

function keyboardLikelyOpen(): boolean {
  const vv = window.visualViewport;
  if (!vv) return false;
  return window.innerHeight - vv.height > 72;
}

/** iOS dismisses the keyboard when we scroll the window while a modal field is focused. */
function shouldDeferWindowScrollPin(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const inModal = active.closest(".modal-sheet-panel, .modal-panel, [role='dialog']");
    if (
      inModal &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement)
    ) {
      return true;
    }
  }
  if (!keyboardLikelyOpen()) return false;
  if (!(active instanceof HTMLElement)) return true;
  return Boolean(active.closest(".modal-sheet-panel, .modal-panel, [role='dialog']"));
}

export function keyboardLikelyOpenForPin(): boolean {
  return keyboardLikelyOpen();
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

/** iOS Safari may scroll the window even when html/body are overflow:hidden. */
export function pinMobileWindowScroll(options?: { force?: boolean }) {
  if (typeof window === "undefined" || !isMobileViewport()) return;
  if (!options?.force && shouldDeferWindowScrollPin()) return;

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  const offsetTop = window.visualViewport?.offsetTop ?? 0;
  if (offsetTop > 0 && keyboardLikelyOpen()) {
    window.scrollTo(0, offsetTop);
    window.scrollTo(0, 0);
  }
}

/** Lighter settle after sheet close / token switch — no input blur. */
export function settleMobileViewportAfterSheetClose() {
  if (typeof window === "undefined" || !isMobileViewport()) return;

  const run = () => {
    pinMobileWindowScroll();
    clearStuckKeyboardBodyStyles();
  };

  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 80);
  if (isStandaloneDisplayMode()) {
    window.setTimeout(run, 200);
    window.setTimeout(run, 420);
  }
}

function resetWindowScrollPosition() {
  pinMobileWindowScroll();
}

function clearStuckKeyboardBodyStyles() {
  if (!isMobileViewport()) return;

  const { body } = document;
  if (body.style.position !== "fixed") return;

  // Hub/token pages already lock html/body; fixed body breaks iOS keyboard in modals.
  if (isTokenPageLockActive() || isHubDiscoveryLockActive() || lockCount <= 0) {
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
  }
}

function resetWindowViewportOnly() {
  resetWindowScrollPosition();
  clearStuckKeyboardBodyStyles();

  if (!shouldPreserveTokenPageInnerScroll()) {
    resetScrollContainers(TOKEN_PAGE_SCROLL_SELECTORS);
  }
}

function resetModalScrollOnly() {
  resetScrollContainers(MODAL_SCROLL_SELECTORS);
}

function resetViewportScroll() {
  resetWindowViewportOnly();
  if (!shouldPreserveTokenPageInnerScroll()) {
    resetModalScrollOnly();
  }
}

/** Reset scroll offsets after mobile keyboard + modal close (iOS Safari). */
export function releaseMobileViewportAfterKeyboard() {
  if (typeof window === "undefined" || !isMobileViewport()) return;

  blurActiveElement();

  const run = () => resetViewportScroll();

  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 120);
  window.setTimeout(run, 320);
  window.setTimeout(run, 520);
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
  if (shouldSkipFixedBodyScrollLock()) {
    document.body.style.overflow = "hidden";
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

  if (snapshot.scrollY > 0 && !shouldSkipFixedBodyScrollLock()) {
    window.scrollTo(0, snapshot.scrollY);
  }

  if (shouldSkipFixedBodyScrollLock()) {
    settleMobileViewportAfterSheetClose();
    return;
  }

  releaseMobileViewportAfterKeyboard();
}

function attachViewportResizeGuard() {
  if (!isMobileViewport() || viewportResizeHandler) return;

  viewportResizeHandler = () => {
    if (lockCount <= 0) return;
    requestAnimationFrame(() => {
      if (lockCount <= 0) return;
      // Pin window only — do not reset inner token scroll or modal list scroll.
      pinMobileWindowScroll();
      clearStuckKeyboardBodyStyles();
    });
  };

  window.visualViewport?.addEventListener("resize", viewportResizeHandler);
  window.visualViewport?.addEventListener("scroll", viewportResizeHandler);
}

function detachViewportResizeGuard() {
  if (!viewportResizeHandler) return;
  window.visualViewport?.removeEventListener("resize", viewportResizeHandler);
  window.visualViewport?.removeEventListener("scroll", viewportResizeHandler);
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

/** Keep the token page from shifting when iOS keyboard opens inside a sheet. */
export function usePinMobileWindowScrollWhile(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const pin = () => pinMobileWindowScroll();

    pin();
    requestAnimationFrame(pin);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", pin);
    vv?.addEventListener("scroll", pin);

    const t1 = window.setTimeout(pin, 80);
    const t2 = window.setTimeout(pin, 200);

    return () => {
      vv?.removeEventListener("resize", pin);
      vv?.removeEventListener("scroll", pin);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active]);
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
    if (isTokenPageLockActive() && isMobileViewport()) {
      settleMobileViewportAfterSheetClose();
      return;
    }
    if (isHubDiscoveryLockActive() && isMobileViewport()) {
      return;
    }
    releaseMobileViewportAfterKeyboard();
  }, [onClose]);
}
