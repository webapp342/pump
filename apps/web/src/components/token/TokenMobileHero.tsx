"use client";

import type { TokenDetail } from "@/lib/db/launchpad";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import { FavoriteIcon } from "@/components/icons/FavoriteIcon";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenSocialLinksBar } from "@/components/token/TokenSocialLinksBar";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { PumpIcon, faCheck, faChevronDown, faCopy, faExternalLink, faShare } from "@/lib/icons";
import { explorerAddressUrl, shortAddress } from "@/config/chain";

type TokenMobileHeroProps = {
  token: TokenDetail;
  priceUsd: number | null;
  changePct: number | null;
  volume24hLabel: string;
  fdvLabel: string;
  ageLabel: string;
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

/** Compact mobile token hero — 3 equal columns aligned with Chart | Trades | Holders tabs. */
export function TokenMobileHero({
  token,
  priceUsd,
  changePct,
  volume24hLabel,
  fdvLabel,
  ageLabel,
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

      <div className="token-mobile-hero__main token-mobile-hero__cols">
        <div className="token-mobile-hero__col token-mobile-hero__col--symbol">
          <div className="token-mobile-hero__lead">
            <TokenAvatar
              address={token.address}
              symbol={token.symbol}
              logoUrl={token.logoUrl}
              size={28}
              className="token-mobile-hero__logo shrink-0 !ring-0"
            />

            <div className="token-mobile-hero__meta">
              <button
                type="button"
                className="token-mobile-hero__symbol-hit"
                onClick={onOpenMarket}
                aria-label="Explore coins"
              >
                <span className="token-mobile-hero__symbol financial-value">{token.symbol}/USD</span>
                <PumpIcon icon={faChevronDown} className="token-mobile-hero__symbol-chevron" />
              </button>
            </div>
          </div>
        </div>

        <div className="token-mobile-hero__col token-mobile-hero__col--price">
          <div className="token-mobile-hero__quote financial-value">
            <div className="token-mobile-hero__price-line">
              <span className="token-mobile-hero__price">
                <PriceHero priceUsd={priceUsd} />
              </span>
              <span className={changeToneClass(changePct)}>{formatChangePct(changePct)}</span>
            </div>
          </div>
        </div>

        <div className="token-mobile-hero__col token-mobile-hero__col--actions">
          <div className="token-mobile-hero__actions">
            <button
              type="button"
              className="token-mobile-hero__icon-btn"
              aria-expanded={detailsOpen}
              aria-controls="token-mobile-hero-details"
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
      </div>

      <div
        id="token-mobile-hero-details"
        className={
          detailsOpen
            ? "token-mobile-hero__details token-mobile-hero__details--open"
            : "token-mobile-hero__details"
        }
        aria-hidden={!detailsOpen}
      >
        <div className="token-mobile-hero__details-body token-mobile-hero__cols">
          <div className="token-mobile-hero__col token-mobile-hero__col--symbol">
            <div className="token-mobile-hero__metric">
              <span className="token-mobile-hero__metric-label">24h volume</span>
              <span className="token-mobile-hero__metric-value financial-value">{volume24hLabel}</span>
            </div>
            <div className="token-mobile-hero__metric">
              <span className="token-mobile-hero__metric-label">Contract</span>
              <div className="token-mobile-hero__contract-line">
                <span className="token-mobile-hero__metric-value financial-value">
                  {shortAddress(token.address, true)}
                </span>
                <a
                  href={explorerAddressUrl(token.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="token-mobile-hero__contract-btn"
                  aria-label="View contract on explorer"
                >
                  <PumpIcon icon={faExternalLink} className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={onCopyAddress}
                  className="token-mobile-hero__contract-btn"
                  aria-label={copiedAddress ? "Address copied" : "Copy contract address"}
                >
                  {copiedAddress ? (
                    <PumpIcon icon={faCheck} className="h-3 w-3" />
                  ) : (
                    <PumpIcon icon={faCopy} className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="token-mobile-hero__col token-mobile-hero__col--price">
            <div className="token-mobile-hero__metric">
              <span className="token-mobile-hero__metric-label">Market cap</span>
              <span className="token-mobile-hero__metric-value financial-value">{fdvLabel}</span>
            </div>
            {showSocialLinks ? (
              <div className="token-mobile-hero__metric">
                <span className="token-mobile-hero__metric-label">Links</span>
                <TokenSocialLinksBar links={token.socialLinks} variant="toolbar" />
              </div>
            ) : null}
          </div>

          <div className="token-mobile-hero__col token-mobile-hero__col--actions">
            <div className="token-mobile-hero__side-meta">
              <div className="token-mobile-hero__metric token-mobile-hero__metric--side">
                <span className="token-mobile-hero__metric-label">Creation time</span>
                <span className="token-mobile-hero__metric-value">{ageLabel}</span>
              </div>
              <div className="token-mobile-hero__metric token-mobile-hero__metric--side">
                <span className="token-mobile-hero__metric-label">Creator</span>
                {creatorAddress ? (
                  <button
                    type="button"
                    className="token-mobile-hero__creator-line"
                    onClick={() => onOpenCreator?.(creatorAddress)}
                    disabled={!onOpenCreator}
                  >
                    <UserAvatarForAddress
                      address={creatorAddress}
                      size={16}
                      className="token-mobile-hero__creator-avatar shrink-0 !ring-0"
                    />
                    <span className="token-mobile-hero__metric-value financial-value">
                      {shortAddress(creatorAddress, true)}
                    </span>
                  </button>
                ) : (
                  <span className="token-mobile-hero__metric-value">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
