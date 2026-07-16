"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useFitTokenChipCount } from "@/hooks/useFitTokenChipCount";
import { useTokenWatchlistStripData } from "@/hooks/useTokenWatchlistStripData";
import { formatArenaQuoteUsd } from "@/lib/arena-board-format";
import { bnbToUsd } from "@/lib/format-usd";
import { PumpIcon, faSettings2 } from "@/lib/icons";
import type { TokenListItem } from "@/lib/db/launchpad";
import {
  readTokenWatchlistStripMode,
  resolveTokenWatchlistStripFilter,
  tokenWatchlistStripLabel,
  TOKEN_WATCHLIST_STRIP_SOURCE_OPTIONS,
  writeTokenWatchlistStripMode,
  type TokenWatchlistStripMode,
} from "@/lib/token-watchlist-strip-prefs";

type TokenWatchlistStripProps = {
  activeTokenAddress: string;
};

function stripEmptyCopy(
  effectiveFilter: ReturnType<typeof resolveTokenWatchlistStripFilter>,
  mode: TokenWatchlistStripMode
): string | null {
  if (effectiveFilter !== "favorites") {
    return "No tokens in this view right now.";
  }
  if (mode === "auto") return null;
  return "Star a token to pin it here.";
}

function StripTokenChip({
  token,
  activeKey,
  mcapUsd,
}: {
  token: TokenListItem;
  activeKey: string;
  mcapUsd: number | null;
}) {
  const addressKey = token.address.toLowerCase();
  const isActive = addressKey === activeKey;

  return (
    <Link
      href={`/token/${token.address}`}
      scroll={false}
      className={
        isActive
          ? "token-favorites-strip__chip token-favorites-strip__chip--active"
          : "token-favorites-strip__chip"
      }
      aria-current={isActive ? "page" : undefined}
    >
      <TokenAvatar
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
        size="xs"
        shape="rounded"
        className="token-favorites-strip__logo shrink-0 !ring-0"
      />
      <span className="token-favorites-strip__symbol financial-value">{token.symbol}</span>
      <span className="token-favorites-strip__mcap financial-value text-pump-muted">
        {formatArenaQuoteUsd(mcapUsd)}
      </span>
    </Link>
  );
}

/** Desktop token page strip — watchlist or configured explore source. */
export function TokenWatchlistStrip({ activeTokenAddress }: TokenWatchlistStripProps) {
  const { isConnected } = useAccount();
  const { favoriteTokens } = useFavorites();
  const { bnbUsd } = useBnbUsdPrice();
  const scrollRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const [stripMode, setStripMode] = useState<TokenWatchlistStripMode>("auto");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMenuPos, setSettingsMenuPos] = useState<{ top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    setStripMode(readTokenWatchlistStripMode());
  }, []);

  const updateSettingsMenuPos = useCallback(() => {
    const button = settingsBtnRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setSettingsMenuPos({
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      setSettingsMenuPos(null);
      return;
    }

    updateSettingsMenuPos();

    function onViewportChange() {
      updateSettingsMenuPos();
    }

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [settingsOpen, updateSettingsMenuPos]);

  useEffect(() => {
    if (!settingsOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        settingsRef.current?.contains(target) ||
        settingsMenuRef.current?.contains(target)
      ) {
        return;
      }
      setSettingsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }

    const listenerId = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
    }, 0);

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(listenerId);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  const hasWatchlist = favoriteTokens.length > 0;
  const effectiveFilter = resolveTokenWatchlistStripFilter(stripMode, hasWatchlist);
  const { tokens } = useTokenWatchlistStripData(effectiveFilter, favoriteTokens);

  const showEmptyHint = tokens.length === 0;
  const emptyCopy = showEmptyHint ? stripEmptyCopy(effectiveFilter, stripMode) : null;
  const fitChips = !showEmptyHint || emptyCopy == null;
  const visibleCount = useFitTokenChipCount(scrollRef, tokens.length, fitChips && tokens.length > 0);
  const visibleTokens = tokens.slice(0, visibleCount);

  const activeKey = activeTokenAddress.toLowerCase();
  const label = tokenWatchlistStripLabel(effectiveFilter);
  const labelActive = effectiveFilter === "favorites" && hasWatchlist;

  const selectMode = useCallback((mode: TokenWatchlistStripMode) => {
    setStripMode(mode);
    writeTokenWatchlistStripMode(mode);
    setSettingsOpen(false);
  }, []);

  if (!isConnected) return null;

  return (
    <section className="token-favorites-strip" aria-label="Watchlist strip">
      <div ref={settingsRef} className="token-favorites-strip__settings">
        <button
          ref={settingsBtnRef}
          type="button"
          className={`token-favorites-strip__settings-btn${
            settingsOpen ? " token-favorites-strip__settings-btn--open" : ""
          }`}
          aria-label="Strip display settings"
          aria-expanded={settingsOpen}
          aria-haspopup="menu"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <PumpIcon icon={faSettings2} className="token-favorites-strip__settings-icon" aria-hidden />
        </button>

        {settingsOpen && settingsMenuPos && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={settingsMenuRef}
                className="token-favorites-strip__settings-menu token-favorites-strip__settings-menu--portal"
                role="menu"
                style={{ top: settingsMenuPos.top, left: settingsMenuPos.left }}
              >
                <p className="token-favorites-strip__settings-heading">Display source</p>
                {TOKEN_WATCHLIST_STRIP_SOURCE_OPTIONS.map(
                  ({ key, label: optionLabel, description }) => {
                    const selected = stripMode === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className={
                          selected
                            ? "token-favorites-strip__settings-item token-favorites-strip__settings-item--active"
                            : "token-favorites-strip__settings-item"
                        }
                        onClick={() => selectMode(key)}
                      >
                        <span className="token-favorites-strip__settings-item-copy">
                          <span className="token-favorites-strip__settings-item-label">
                            {optionLabel}
                          </span>
                          <span className="token-favorites-strip__settings-item-desc">
                            {description}
                          </span>
                        </span>
                      </button>
                    );
                  }
                )}
              </div>,
              document.body
            )
          : null}
      </div>

      <div
        className={
          labelActive
            ? "token-favorites-strip__label token-favorites-strip__label--active"
            : "token-favorites-strip__label"
        }
      >
        <span className="token-favorites-strip__label-text">{label}</span>
      </div>

      <div
        ref={scrollRef}
        className={`token-favorites-strip__scroll${
          fitChips && tokens.length > 0 ? " token-favorites-strip__scroll--fit" : ""
        }`}
      >
        {emptyCopy ? (
          <p className="token-favorites-strip__empty text-caption text-pump-muted">{emptyCopy}</p>
        ) : (
          visibleTokens.map((token) => (
            <StripTokenChip
              key={token.address.toLowerCase()}
              token={token}
              activeKey={activeKey}
              mcapUsd={bnbToUsd(Number(token.marketCapBnb), bnbUsd)}
            />
          ))
        )}
      </div>
    </section>
  );
}

/** @deprecated Use TokenWatchlistStrip */
export const TokenFavoritesStrip = TokenWatchlistStrip;
