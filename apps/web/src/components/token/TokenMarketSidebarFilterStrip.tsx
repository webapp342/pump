"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PumpIcon, faChevronLeft, faChevronRight, faStarSolid } from "@/lib/icons";
import type { BoardFilter } from "@/lib/arena-filters";
import { SIDEBAR_FILTER_ITEMS } from "@/lib/arena-explore-board-core";

type TokenMarketSidebarFilterStripProps = {
  activeFilter: BoardFilter;
  onSelect: (filter: BoardFilter) => void;
  /** Renders inline after filter chips (e.g. quick trade prefs). */
  trailing?: ReactNode;
};

export function TokenMarketSidebarFilterStrip({
  activeFilter,
  onSelect,
  trailing,
}: TokenMarketSidebarFilterStripProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const overflow = maxScroll > 1;
    setHasOverflow(overflow);
    setCanScrollLeft(overflow && viewport.scrollLeft > 1);
    setCanScrollRight(overflow && viewport.scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateScrollState();

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(viewport);
    if (viewport.firstElementChild) {
      observer.observe(viewport.firstElementChild);
    }

    viewport.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState]);

  const scrollBy = useCallback((direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: direction * 112, behavior: "smooth" });
  }, []);

  return (
    <div
      className={`token-market-sidebar__filter-strip ${
        hasOverflow ? "" : "token-market-sidebar__filter-strip--flush"
      }`}
      role="presentation"
    >
      {hasOverflow ? (
        <button
          type="button"
          className="token-market-sidebar__filter-scroll-btn"
          aria-label="Scroll filters left"
          disabled={!canScrollLeft}
          onClick={() => scrollBy(-1)}
        >
          <PumpIcon icon={faChevronLeft} className="h-3 w-3" />
        </button>
      ) : null}

      <div
        ref={viewportRef}
        className="token-market-sidebar__filter-viewport"
        role="tablist"
        aria-label="Explore coin filters"
      >
        <div className="token-market-sidebar__filter-tabs">
          {SIDEBAR_FILTER_ITEMS.map(([key, label]) => {
            const isActive = activeFilter === key;
            const isFavorites = key === "favorites";

            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={isFavorites ? "Favorites" : (label ?? key)}
                onClick={() => onSelect(key)}
                className={`token-market-sidebar__filter-tab ${
                  isActive ? "token-market-sidebar__filter-tab--active" : ""
                } ${isFavorites ? "token-market-sidebar__filter-tab--icon" : ""}`}
              >
                {isFavorites ? (
                  <PumpIcon
                    icon={faStarSolid}
                    className={`h-3 w-3 ${isActive ? "text-pump-accent" : ""}`}
                  />
                ) : (
                  label
                )}
              </button>
            );
          })}
          {trailing ? (
            <>
              <span className="token-market-sidebar__filter-tools-divider" aria-hidden />
              <div className="token-market-sidebar__filter-trailing">{trailing}</div>
            </>
          ) : null}
        </div>
      </div>

      {hasOverflow ? (
        <button
          type="button"
          className="token-market-sidebar__filter-scroll-btn"
          aria-label="Scroll filters right"
          disabled={!canScrollRight}
          onClick={() => scrollBy(1)}
        >
          <PumpIcon icon={faChevronRight} className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
