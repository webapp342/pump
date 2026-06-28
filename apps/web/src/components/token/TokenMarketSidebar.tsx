"use client";

import { useArenaExploreBoard } from "@/hooks/useArenaExploreBoard";
import { bnbToUsd } from "@/lib/format-usd";
import { listTokenPriceUsd } from "@/lib/arena-board-format";
import { emptyExploreFilterCopy } from "@/lib/arena-explore-board-core";
import { TokenMarketSidebarRow } from "@/components/token/TokenMarketSidebarRow";
import { TokenMarketSidebarHead } from "@/components/token/TokenMarketSidebarHead";
import { TokenMarketSidebarFilterStrip } from "@/components/token/TokenMarketSidebarFilterStrip";
import { FieldSearchInput } from "@/components/ui/FieldSearchInput";
import type { TokenSidebarDensity } from "@/hooks/useTokenSidebarWidth";
import type { Ref } from "react";

type TokenMarketSidebarProps = {
  id?: string;
  activeTokenAddress: string;
  density?: TokenSidebarDensity;
  headWrapRef?: Ref<HTMLDivElement>;
};

export function TokenMarketSidebar({
  id,
  activeTokenAddress,
  density = "full",
  headWrapRef,
}: TokenMarketSidebarProps) {
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
    boardRefreshing,
    showLoadMore,
    loadingMore,
    loadMoreRef,
    isConnected,
    favorites,
    favoriteListTokens,
    search,
    setSearch,
  } = useArenaExploreBoard();

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

  return (
    <section
      id={id}
      className="token-market-sidebar panel-surface"
      data-density={density}
      aria-label="Explore coins"
    >
      <div className="token-market-sidebar__toolbar">
        <FieldSearchInput
          embedded
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          aria-label="Search coins"
          wrapperClassName="token-market-sidebar__search"
          className="!h-8 !pl-8 !pr-2 text-caption"
        />

        <TokenMarketSidebarFilterStrip
          activeFilter={activeFilter}
          onSelect={setArenaFilter}
        />

        {boardRefreshing ? (
          <p className="token-market-sidebar__refresh text-[10px] text-pump-muted" aria-live="polite">
            Updating…
          </p>
        ) : null}
      </div>

      <div className="token-market-sidebar__head-wrap" ref={headWrapRef}>
        <TokenMarketSidebarHead density={density} />
      </div>

      <div className="token-market-sidebar__list">
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
