"use client";

import { useEffect, useRef, type Ref } from "react";
import { useArenaExploreBoard } from "@/hooks/useArenaExploreBoard";
import { bnbToUsd } from "@/lib/format-usd";
import { listTokenPriceUsd } from "@/lib/arena-board-format";
import { emptyExploreFilterCopy } from "@/lib/arena-explore-board-core";
import { TokenMarketSidebarRow } from "@/components/token/TokenMarketSidebarRow";
import { TokenMarketSidebarHead } from "@/components/token/TokenMarketSidebarHead";
import { TokenMarketSidebarFilterStrip } from "@/components/token/TokenMarketSidebarFilterStrip";
import { ArenaSwipeTradeBar } from "@/components/arena/ArenaSwipeTradeBar";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import { pinMobileWindowScroll } from "@/hooks/useMobileModalScrollLock";
import type { TokenSidebarDensity } from "@/hooks/useTokenSidebarWidth";

type TokenMarketSidebarProps = {
  id?: string;
  activeTokenAddress: string;
  density?: TokenSidebarDensity;
  headWrapRef?: Ref<HTMLDivElement>;
  className?: string;
  onTokenSelect?: () => void;
  onSearchFocusChange?: (focused: boolean) => void;
  /** Mobile sheet — search mode hides filters/columns and shows Cancel. */
  searchActive?: boolean;
  onSearchDismiss?: () => void;
  searchInputRef?: Ref<HTMLInputElement>;
  /** Desktop trade sidebar — quick trade prefs next to filter chips. */
  showQuickTrade?: boolean;
};

export function TokenMarketSidebar({
  id,
  activeTokenAddress,
  density = "full",
  headWrapRef,
  className = "",
  onTokenSelect,
  onSearchFocusChange,
  searchActive = false,
  onSearchDismiss,
  searchInputRef,
  showQuickTrade = false,
}: TokenMarketSidebarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const mobileSearchChrome = Boolean(onSearchFocusChange);

  const assignSearchInputRef = (node: HTMLInputElement | null) => {
    if (typeof searchInputRef === "function") {
      searchInputRef(node);
    } else if (searchInputRef && "current" in searchInputRef) {
      searchInputRef.current = node;
    }
  };

  useEffect(() => {
    if (!searchActive) return;
    listRef.current?.scrollTo({ top: 0 });
  }, [searchActive]);
  const {
    exploreBoardTokens,
    activeFilter,
    setArenaFilter,
    effectiveBnbUsd,
    flashes,
    animatedCaps,
    boardRowClass,
    isFavorite,
    toggleFavorite,
    error,
    tokens,
    showLoadMore,
    loadingMore,
    loadMoreRef,
    isConnected,
    favorites,
    favoriteListTokens,
    search,
    setSearch,
  } = useArenaExploreBoard({ animateRows: false });

  const emptyCopy = emptyExploreFilterCopy(activeFilter, {
    search,
    isConnected,
    favoritesCount: favorites.size,
    favoriteListLoaded: favoriteListTokens.length > 0 || favorites.size === 0,
  });

  if (error && tokens === null) {
    return (
      <section className="token-market-sidebar panel-surface" aria-label="Explore coins">
        <p className="token-market-sidebar__note text-caption text-pump-danger">{error}</p>
      </section>
    );
  }

  const sectionClass = [
    "token-market-sidebar panel-surface",
    className,
    searchActive ? "token-market-sidebar--search-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleSearchFocus = onSearchFocusChange
    ? () => {
        pinMobileWindowScroll();
        requestAnimationFrame(() => pinMobileWindowScroll());
        onSearchFocusChange(true);
      }
    : undefined;

  return (
    <section
      id={id}
      className={sectionClass}
      data-density={density}
      aria-label="Explore coins"
    >
      <div
        className={`token-market-sidebar__toolbar${
          searchActive ? " token-market-sidebar__toolbar--search-active" : ""
        }`}
      >
        <div className="token-market-sidebar__search-row">
          <FieldSearchInput
            ref={assignSearchInputRef}
            embedded
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onFocus={handleSearchFocus}
            placeholder={searchActive ? "Search by name or symbol" : "Search"}
            aria-label="Search coins"
            wrapperClassName="token-market-sidebar__search"
            className="!h-9 !pl-8 !pr-2"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {mobileSearchChrome && searchActive && onSearchDismiss ? (
            <button
              type="button"
              className="token-market-sidebar__search-cancel"
              onClick={onSearchDismiss}
            >
              Cancel
            </button>
          ) : null}
        </div>

        {!searchActive ? (
          <TokenMarketSidebarFilterStrip
            activeFilter={activeFilter}
            onSelect={setArenaFilter}
            trailing={
              showQuickTrade ? (
                <div className="hidden lg:block">
                  <ArenaSwipeTradeBar />
                </div>
              ) : null
            }
          />
        ) : null}
      </div>

      {!searchActive ? (
        <div className="token-market-sidebar__head-wrap" ref={headWrapRef}>
          <TokenMarketSidebarHead density={density} />
        </div>
      ) : null}

      <div className="token-market-sidebar__list" ref={listRef}>
        {exploreBoardTokens.length === 0 ? (
          <p className="token-market-sidebar__note text-caption text-pump-muted">
            {tokens === null ? "Loading coins…" : emptyCopy}
          </p>
        ) : (
          exploreBoardTokens.map((token) => {
            const addressKey = token.address.toLowerCase();
            const mcapUsd =
              animatedCaps[`${addressKey}:cap:mcap`] ??
              bnbToUsd(Number(token.marketCapBnb), effectiveBnbUsd);
            const priceUsd =
              animatedCaps[`${addressKey}:cap:price`] ??
              listTokenPriceUsd(token.marketCapBnb, effectiveBnbUsd);
            const vol24hUsd =
              animatedCaps[`${addressKey}:cap:vol24h`] ??
              bnbToUsd(Number(token.volume24hBnb ?? 0), effectiveBnbUsd);

            return (
              <TokenMarketSidebarRow
                key={addressKey}
                token={token}
                activeTokenAddress={activeTokenAddress}
                density={density}
                mcapUsd={mcapUsd}
                priceUsd={priceUsd}
                vol24hUsd={vol24hUsd}
                bnbUsd={effectiveBnbUsd}
                mcapFlash={flashes[`${addressKey}:mcap`]}
                priceFlash={flashes[`${addressKey}:price`]}
                volFlash={flashes[`${addressKey}:vol24h`]}
                rowClass={boardRowClass(addressKey)}
                isFavorite={isFavorite(token.address)}
                onToggleFavorite={toggleFavorite}
                onTokenSelect={onTokenSelect}
              />
            );
          })
        )}

        {showLoadMore ? (
          <div
            ref={loadMoreRef}
            className="token-market-sidebar__load-more text-center text-caption text-pump-muted"
            aria-hidden={!loadingMore}
          >
            {loadingMore ? "Loading more…" : ""}
          </div>
        ) : null}
      </div>
    </section>
  );
}
