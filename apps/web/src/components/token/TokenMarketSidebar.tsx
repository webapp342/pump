"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type Ref,
} from "react";
import { useArenaExploreBoard } from "@/hooks/useArenaExploreBoard";
import { useArenaQuickTrade } from "@/hooks/useArenaQuickTrade";
import { bnbToUsd } from "@/lib/format-usd";
import { listTokenPriceUsd } from "@/lib/arena-board-format";
import { applyActiveMarketToListItem } from "@/lib/token-market-snapshot";
import { emptyExploreFilterCopy } from "@/lib/arena-explore-board-core";
import { TokenMarketSidebarArenaRow } from "@/components/token/TokenMarketSidebarArenaRow";
import { TokenMarketSidebarRow } from "@/components/token/TokenMarketSidebarRow";
import { TokenMarketSidebarHead } from "@/components/token/TokenMarketSidebarHead";
import { TokenMarketSidebarFilterStrip } from "@/components/token/TokenMarketSidebarFilterStrip";
import { HoldingsSwipeHint } from "@/components/portfolio/HoldingsSwipeHint";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import { pinMobileWindowScroll } from "@/hooks/useMobileModalScrollLock";
import { useArenaQuickTradeSettings } from "@/hooks/useArenaQuickTradeSettings";
import { quickTradeSwipeLabels } from "@/lib/arena-quick-trade";
import { PumpIcon, faSettings2 } from "@/lib/icons";
import type { TokenSidebarDensity } from "@/hooks/useTokenSidebarWidth";

/** Survives rare sidebar remounts — desktop trade list should not jump to top on token switch. */
let persistentDesktopSidebarScrollTop = 0;

type TokenMarketSidebarProps = {
  id?: string;
  activeTokenAddress: string;
  /** Live mark from token page — keeps sidebar row in sync with header/chart. */
  activeMarketSnapshot?: {
    spotPriceBnb: number;
    marketCapBnb: number;
    volume24hBnb?: number;
    tradeCount?: number;
  };
  density?: TokenSidebarDensity;
  headWrapRef?: Ref<HTMLDivElement>;
  className?: string;
  onTokenSelect?: () => void;
  onSearchFocusChange?: (focused: boolean) => void;
  /** Mobile sheet — search mode hides filters/columns. */
  searchActive?: boolean;
  searchInputRef?: Ref<HTMLInputElement>;
  /** Desktop trade sidebar — settings icon beside search opens quick-trade prefs. */
  showQuickTrade?: boolean;
  /** Mobile token picker sheet — swipe trade + settings icon, unified chrome. */
  mobileSheet?: boolean;
  /** When set, parent owns TradeSheet (survives sheet close). */
  onOpenQuickTrade?: (tokenAddress: string, symbol: string, side: "buy" | "sell") => void;
  /** Set false when parent renders quickTradeSheet. */
  renderQuickTradeSheet?: boolean;
};

export function TokenMarketSidebar({
  id,
  activeTokenAddress,
  activeMarketSnapshot,
  density = "full",
  headWrapRef,
  className = "",
  onTokenSelect,
  onSearchFocusChange,
  searchActive = false,
  searchInputRef,
  showQuickTrade = false,
  mobileSheet = false,
  onOpenQuickTrade,
  renderQuickTradeSheet = true,
}: TokenMarketSidebarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const internalQuickTrade = useArenaQuickTrade();
  const openQuickTrade = onOpenQuickTrade ?? internalQuickTrade.openQuickTrade;
  const quickTradeSheet = renderQuickTradeSheet ? internalQuickTrade.quickTradeSheet : null;
  const effectiveQuickTrade = showQuickTrade || mobileSheet;
  const {
    settingsOpen: quickTradeSettingsOpen,
    openSettings: openQuickTradeSettings,
    settingsLayer: quickTradeSettingsLayer,
  } = useArenaQuickTradeSettings();
  const useArenaRows = !mobileSheet;
  const swipeHintLabels = quickTradeSwipeLabels();

  const assignSearchInputRef = (node: HTMLInputElement | null) => {
    if (typeof searchInputRef === "function") {
      searchInputRef(node);
    } else if (searchInputRef && "current" in searchInputRef) {
      searchInputRef.current = node;
    }
  };

  useEffect(() => {
    if (!searchActive) return;
    persistentDesktopSidebarScrollTop = 0;
    listRef.current?.scrollTo({ top: 0 });
  }, [searchActive]);

  const restoreDesktopListScroll = useCallback(() => {
    if (mobileSheet || searchActive) return;
    const el = listRef.current;
    if (!el || persistentDesktopSidebarScrollTop <= 0) return;
    if (el.scrollTop !== persistentDesktopSidebarScrollTop) {
      el.scrollTop = persistentDesktopSidebarScrollTop;
    }
  }, [mobileSheet, searchActive]);

  useEffect(() => {
    if (mobileSheet) return;
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      persistentDesktopSidebarScrollTop = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [mobileSheet]);

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

  useLayoutEffect(() => {
    restoreDesktopListScroll();
  }, [activeTokenAddress, exploreBoardTokens.length, restoreDesktopListScroll]);

  useEffect(() => {
    if (mobileSheet || searchActive) return;
    const frame = requestAnimationFrame(() => restoreDesktopListScroll());
    return () => cancelAnimationFrame(frame);
  }, [activeTokenAddress, exploreBoardTokens.length, mobileSheet, searchActive, restoreDesktopListScroll]);

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
    "token-market-sidebar",
    mobileSheet ? "token-market-sidebar--mobile-sheet" : "panel-surface",
    useArenaRows ? "token-market-sidebar--arena-list" : "",
    className,
    searchActive ? "token-market-sidebar--search-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleSearchFocus = onSearchFocusChange
    ? () => {
        if (!mobileSheet) {
          pinMobileWindowScroll();
          requestAnimationFrame(() => pinMobileWindowScroll());
        }
        onSearchFocusChange(true);
      }
    : undefined;

  const handleSearchBlur = onSearchFocusChange
    ? (event: FocusEvent<HTMLInputElement>) => {
        const next = event.relatedTarget;
        const toolbar = event.currentTarget.closest(".token-market-sidebar__toolbar");
        if (next instanceof Node && toolbar?.contains(next)) return;
        onSearchFocusChange(false);
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
        <div
          className={`token-market-sidebar__search-row${
            mobileSheet && searchActive ? " token-market-sidebar__search-row--focus" : ""
          }`}
        >
          <FieldSearchInput
            ref={assignSearchInputRef}
            embedded
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
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
          {effectiveQuickTrade ? (
            <button
              type="button"
              className={`token-market-sidebar__settings-btn${
                quickTradeSettingsOpen ? " token-market-sidebar__settings-btn--open" : ""
              }${mobileSheet ? "" : " hidden lg:inline-flex"}`}
              onClick={openQuickTradeSettings}
              aria-label="Quick trade settings"
              aria-expanded={quickTradeSettingsOpen}
              aria-haspopup="dialog"
            >
              <PumpIcon icon={faSettings2} className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {!searchActive ? (
          <TokenMarketSidebarFilterStrip
            activeFilter={activeFilter}
            onSelect={setArenaFilter}
          />
        ) : null}
      </div>

      {effectiveQuickTrade ? quickTradeSettingsLayer : null}

      {!searchActive && useArenaRows ? (
        <div ref={headWrapRef} className="token-market-sidebar__arena-anchor" aria-hidden="true" />
      ) : !searchActive ? (
        <div className="token-market-sidebar__head-wrap" ref={headWrapRef}>
          <TokenMarketSidebarHead density={density} />
        </div>
      ) : null}

      <div
        className="token-market-sidebar__list"
        ref={listRef}
        data-persist-scroll={mobileSheet ? undefined : ""}
      >
        {mobileSheet && !searchActive && exploreBoardTokens.length > 0 ? (
          <div className="token-market-sidebar__swipe-hint px-2 pt-2">
            <HoldingsSwipeHint
              buyLabel={swipeHintLabels.buyLabel}
              sellLabel={swipeHintLabels.sellLabel}
            />
          </div>
        ) : null}
        {exploreBoardTokens.length === 0 ? (
          <p className="token-market-sidebar__note text-caption text-pump-muted">
            {tokens === null ? "Loading coins…" : emptyCopy}
          </p>
        ) : (
          exploreBoardTokens.map((token, index) => {
            const addressKey = token.address.toLowerCase();
            const isActive =
              activeMarketSnapshot != null &&
              addressKey === activeTokenAddress.toLowerCase();
            const rowToken = isActive
              ? applyActiveMarketToListItem(token, activeMarketSnapshot)
              : token;
            /** Active token row: header snapshot wins — skip arena animatedCaps (4× jump filter + 1s tween lag). */
            const mcapUsd = isActive
              ? bnbToUsd(Number(rowToken.marketCapBnb), effectiveBnbUsd)
              : (animatedCaps[`${addressKey}:cap:mcap`] ??
                bnbToUsd(Number(rowToken.marketCapBnb), effectiveBnbUsd));
            const priceUsd = isActive
              ? listTokenPriceUsd(rowToken.marketCapBnb, effectiveBnbUsd)
              : (animatedCaps[`${addressKey}:cap:price`] ??
                listTokenPriceUsd(rowToken.marketCapBnb, effectiveBnbUsd));
            const vol24hUsd = isActive
              ? bnbToUsd(Number(rowToken.volume24hBnb ?? 0), effectiveBnbUsd)
              : (animatedCaps[`${addressKey}:cap:vol24h`] ??
                bnbToUsd(Number(rowToken.volume24hBnb ?? 0), effectiveBnbUsd));

            if (useArenaRows) {
              return (
                <TokenMarketSidebarArenaRow
                  key={addressKey}
                  token={rowToken}
                  activeTokenAddress={activeTokenAddress}
                  mcapUsd={mcapUsd}
                  vol24hUsd={vol24hUsd}
                  mcapFlash={flashes[`${addressKey}:mcap`]}
                  rowClass={boardRowClass(addressKey)}
                  onTokenSelect={onTokenSelect}
                  onQuickTrade={
                    effectiveQuickTrade
                      ? (side) => openQuickTrade(token.address, token.symbol, side)
                      : undefined
                  }
                  showRowQuickActions={effectiveQuickTrade}
                />
              );
            }

            return (
              <TokenMarketSidebarRow
                key={addressKey}
                token={rowToken}
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
                onQuickTrade={
                  effectiveQuickTrade
                    ? (side) => openQuickTrade(token.address, token.symbol, side)
                    : undefined
                }
                showRowQuickActions={false}
                enableSwipeTrade={mobileSheet && effectiveQuickTrade}
                peekSwipeOnMount={mobileSheet && index === 0}
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
      {quickTradeSheet}
    </section>
  );
}
