"use client";

import type { TokenDetail } from "@/lib/db/launchpad";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import { FavoriteIcon } from "@/components/icons/FavoriteIcon";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenSocialLinksBar } from "@/components/token/TokenSocialLinksBar";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import {
  PumpIcon,
  faCheck,
  faChevronDown,
  faCopy,
  faList,
  faShare,
} from "@/lib/icons";
import { shortAddress } from "@/config/chain";

type TokenMobileHeroProps = {
  token: TokenDetail;
  priceUsd: number | null;
  changePct: number | null;
  volume24hLabel: string;
  fdvLabel: string;
  showSocialLinks: boolean;
  favorited: boolean;
  tradeLocked: boolean;
  copiedAddress: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onOpenMarket: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
  onCopyAddress: () => void;
  onOpenCreator?: (address: string) => void;
  isRefreshing?: boolean;
};

function changeToneClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return "token-mobile-hero__change";
  }
  return value > 0
    ? "token-mobile-hero__change token-mobile-hero__change--up"
    : "token-mobile-hero__change token-mobile-hero__change--down";
}

function formatChangePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct >= 0 && pct !== 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function PriceHero({ priceUsd }: { priceUsd: number | null }) {
  if (priceUsd != null && Number.isFinite(priceUsd) && priceUsd >= 1) {
    return (
      <span className="financial-value">
        $
        {priceUsd.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })}
      </span>
    );
  }
  return <PumpSubscriptPrice value={priceUsd} prefix="$" />;
}

/** Mobile token hero — explore + pair row, expandable 2-column price / stats grid. */
export function TokenMobileHero({
  token,
  priceUsd,
  changePct,
  volume24hLabel,
  fdvLabel,
  showSocialLinks,
  favorited,
  tradeLocked,
  copiedAddress,
  detailsOpen,
  onToggleDetails,
  onOpenMarket,
  onToggleFavorite,
  onShare,
  onCopyAddress,
  onOpenCreator,
  isRefreshing = false,
}: TokenMobileHeroProps) {
  const creatorAddress = token.creatorAddress?.trim() ?? "";

  return (
    <div
      className={`token-mobile-hero panel-surface${isRefreshing ? " token-mobile-hero--refreshing" : ""}`}
    >
      <h1 className="sr-only">
        {token.name} ({token.symbol}/USD)
      </h1>

      <div className="token-mobile-hero__top">
        <button
          type="button"
          className="token-mobile-hero__icon-btn"
          onClick={onOpenMarket}
          aria-label="Explore coins"
        >
          <PumpIcon icon={faList} className="token-mobile-hero__explore-icon" />
        </button>

        <div className="token-mobile-hero__pair">
          <TokenAvatar
            address={token.address}
            symbol={token.symbol}
            logoUrl={token.logoUrl}
            size={28}
            className="token-mobile-hero__logo shrink-0 !ring-0"
          />
          <span className="token-mobile-hero__symbol financial-value">{token.symbol}/USD</span>
        </div>

        <div className="token-mobile-hero__actions">
          <button
            type="button"
            className="token-mobile-hero__icon-btn"
            aria-expanded={detailsOpen}
            aria-controls="token-mobile-hero-stats"
            aria-label={detailsOpen ? "Hide token details" : "Show token details"}
            onClick={onToggleDetails}
          >
            <PumpIcon
              icon={faChevronDown}
              className={
                detailsOpen
                  ? "token-mobile-hero__details-chevron token-mobile-hero__details-chevron--open"
                  : "token-mobile-hero__details-chevron"
              }
            />
          </button>
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={tradeLocked}
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            className={
              favorited
                ? "token-mobile-hero__icon-btn token-mobile-hero__icon-btn--fav-active"
                : "token-mobile-hero__icon-btn"
            }
          >
            <FavoriteIcon active={favorited} className="token-mobile-hero__fav-icon" />
          </button>
          <button
            type="button"
            onClick={onShare}
            className="token-mobile-hero__icon-btn"
            aria-label="Share token"
          >
            <PumpIcon icon={faShare} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        id="token-mobile-hero-stats"
        className={
          detailsOpen
            ? "token-mobile-hero__stats token-mobile-hero__stats--open"
            : "token-mobile-hero__stats"
        }
        aria-hidden={!detailsOpen}
      >
        <div className="token-mobile-hero__stats-grid">
          <div className="token-mobile-hero__stats-col token-mobile-hero__stats-col--quote">
            <div className="token-mobile-hero__price">
              <PriceHero priceUsd={priceUsd} />
            </div>
            <p className={changeToneClass(changePct)}>{formatChangePct(changePct)}</p>
            <div className="token-mobile-hero__address-row">
              <span className="token-mobile-hero__address financial-value">
                {shortAddress(token.address, true)}
              </span>
              <button
                type="button"
                onClick={onCopyAddress}
                className="token-mobile-hero__copy-btn"
                aria-label={copiedAddress ? "Address copied" : "Copy contract address"}
              >
                {copiedAddress ? (
                  <PumpIcon icon={faCheck} className="h-3 w-3 text-pump-success" />
                ) : (
                  <PumpIcon icon={faCopy} className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>

          <div className="token-mobile-hero__stats-col token-mobile-hero__stats-col--metrics">
            <div className="token-mobile-hero__stat-row">
              <span className="token-mobile-hero__stat-label">Market Cap</span>
              <span className="token-mobile-hero__stat-value financial-value">{fdvLabel}</span>
            </div>
            <div className="token-mobile-hero__stat-row">
              <span className="token-mobile-hero__stat-label">24H Vol.</span>
              <span className="token-mobile-hero__stat-value financial-value">{volume24hLabel}</span>
            </div>
            <div className="token-mobile-hero__stat-row">
              <span className="token-mobile-hero__stat-label">Creator</span>
              {creatorAddress ? (
                <button
                  type="button"
                  className="token-mobile-hero__stat-value token-mobile-hero__creator-hit financial-value"
                  onClick={() => onOpenCreator?.(creatorAddress)}
                  disabled={!onOpenCreator}
                >
                  <UserAvatarForAddress
                    address={creatorAddress}
                    size={14}
                    className="token-mobile-hero__creator-avatar shrink-0 !ring-0"
                  />
                  <span className="truncate">{shortAddress(creatorAddress, true)}</span>
                </button>
              ) : (
                <span className="token-mobile-hero__stat-value">—</span>
              )}
            </div>
            <div className="token-mobile-hero__stat-row">
              <span className="token-mobile-hero__stat-label">Links</span>
              <div className="token-mobile-hero__stat-value token-mobile-hero__links-value">
                {showSocialLinks ? (
                  <TokenSocialLinksBar links={token.socialLinks} variant="toolbar" />
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
