"use client";

import { useEffect } from "react";
import { pinMobileWindowScroll, keyboardLikelyOpenForPin } from "@/hooks/useMobileModalScrollLock";

const LOCK_CLASS = "hub-discovery-scroll-lock";
const SEARCH_FOCUS_CLASS = "hub-discovery-search-focus";
const MOBILE_MQ = "(max-width: 767px)";

const SCROLL_CONTAINER_SELECTOR = [
  ".arena-page__scroll",
  ".airdrops-list__scroll",
  ".airdrops-body:not(:has(.airdrops-list))",
  ".airdrop-detail-hub",
  ".airdrop-create-preview-board",
  ".airdrop-create-step-panel__body",
  ".missions-list__scroll",
  ".missions-body:not(:has(.missions-list))",
  ".points-overview",
  ".points-hub-panel",
  ".points-hub__body",
  ".portfolio-holdings-mobile__body",
  ".portfolio-tab-scroll",
  ".portfolio-fees-tab",
].join(", ");

const INTERACTION_SELECTOR = [
  ".arena-tab-nav__track",
  ".airdrops-tab-nav__track",
  ".portfolio-tab-nav__track",
  ".arena-search-input",
  ".arena-search-field",
  ".arena-filter-bar__settings-btn",
  ".arena-filter-bar__tool-btn",
  ".arena-filter-bar__mobile-search",
  ".arena-filter-bar__mobile-search .arena-search-field",
  ".modal-sheet-host",
  ".modal-sheet-panel",
  ".modal-backdrop",
].join(", ");

function isMobileHub(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
}

function isHubSearchInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement)) return false;
  if (!target.classList.contains("arena-search-input")) return false;
  return Boolean(target.closest(".arena-page, .airdrops-page"));
}

function isScrollable(element: Element): boolean {
  return element.scrollHeight > element.clientHeight + 1;
}

function isAllowedTouchScrollTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  if (target.closest(INTERACTION_SELECTOR)) return true;

  const scrollContainer = target.closest(SCROLL_CONTAINER_SELECTOR);
  if (!scrollContainer) return false;

  return isScrollable(scrollContainer);
}

/** Mobile hub terminal pages — lock document scroll; only designated panes scroll when they overflow. */
export function HubDiscoveryScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(LOCK_CLASS);

    const pin = () => {
      if (!isMobileHub()) return;
      pinMobileWindowScroll();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isHubSearchInput(event.target)) return;
      root.classList.add(SEARCH_FOCUS_CLASS);
      pin();
      requestAnimationFrame(pin);
      window.setTimeout(pin, 80);
      window.setTimeout(pin, 200);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (!isHubSearchInput(event.target)) return;
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && isHubSearchInput(active)) return;
        root.classList.remove(SEARCH_FOCUS_CLASS);
        pin();
      }, 120);
    };

    const onViewportChange = () => {
      if (keyboardLikelyOpenForPin()) return;
      pin();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isMobileHub()) return;
      if (isAllowedTouchScrollTarget(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportChange);
    vv?.addEventListener("scroll", onViewportChange);

    pin();

    return () => {
      root.classList.remove(LOCK_CLASS);
      root.classList.remove(SEARCH_FOCUS_CLASS);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("touchmove", onTouchMove);
      vv?.removeEventListener("resize", onViewportChange);
      vv?.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  return null;
}
