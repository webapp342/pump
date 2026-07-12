"use client";

import Link from "next/link";
import type { TokenDetail } from "@/lib/db/launchpad";
import { PumpSubscriptPrice } from "@/components/ui/PumpSubscriptPrice";
import { FavoriteIcon } from "@/components/icons/FavoriteIcon";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TokenSocialLinksBar } from "@/components/token/TokenSocialLinksBar";
import { PumpIcon, faArrowLeft, faCheck, faClock, faCopy } from "@/lib/icons";
import { shortAddress } from "@/config/chain";
import { formatAge, isTokenAgeUnder1h } from "@/lib/arena-board-format";
import { hapticTap } from "@/lib/haptic";

type TokenMobileHeroProps = {
  token: TokenDetail;
  priceUsd: number | null;
  mcapUsd: number | null;
  chartCurrency: "usd" | "mcap";
  changePct: number | null;
  showSocialLinks: boolean;
  favorited: boolean;
  tradeLocked: boolean;
  copiedAddress: boolean;
  onToggleFavorite: () => void;
  onCopyAddress: () => void;
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

function formatHeroMcapUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
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

function HeroQuoteMetric({
  chartCurrency,
  priceUsd,
  mcapUsd,
}: {
  chartCurrency: "usd" | "mcap";
  priceUsd: number | null;
  mcapUsd: number | null;
}) {
  if (chartCurrency === "mcap") {
    return <span className="financial-value">{formatHeroMcapUsd(mcapUsd)}</span>;
  }
  return <PriceHero priceUsd={priceUsd} />;
}

/** Mobile token hero — chrome bar + static pair display. */
export function TokenMobileHero({
  token,
  priceUsd,
  mcapUsd,
  chartCurrency,
  changePct,
  showSocialLinks,
  favorited,
  tradeLocked,
  copiedAddress,
  onToggleFavorite,
  onCopyAddress,
  isRefreshing = false,
}: TokenMobileHeroProps) {
  const ageIsFresh = isTokenAgeUnder1h(token.createdAt);

  const handleCopyAddress = () => {
    hapticTap(6);
    onCopyAddress();
  };

  return (
    <div
      className={`token-mobile-hero panel-surface${
        isRefreshing ? " token-mobile-hero--refreshing" : ""
      }`}
    >
      <h1 className="sr-only">
        {token.name} ({token.symbol})
      </h1>

      <div className="token-mobile-hero__chrome">
        <Link
          href="/arena"
          className="token-mobile-hero__back-btn"
          aria-label="Back to Arena"
          onClick={() => hapticTap(6)}
        >
          <PumpIcon icon={faArrowLeft} className="token-mobile-hero__back-icon" aria-hidden />
        </Link>

        <div className="token-mobile-hero__chrome-meta">
          <span className="token-mobile-hero__chrome-symbol">{token.symbol}</span>
          <span className="token-mobile-hero__chrome-divider" aria-hidden />
          <span
            className={`token-mobile-hero__chrome-age financial-value${
              ageIsFresh ? " token-mobile-hero__chrome-age--fresh" : ""
            }`}
          >
            <PumpIcon icon={faClock} className="token-mobile-hero__chrome-age-icon" aria-hidden />
            {formatAge(token.createdAt)}
          </span>
        </div>

        <div className="token-mobile-hero__chrome-actions">
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
        </div>
      </div>

      <div className="token-mobile-hero__top">
        <div className="token-mobile-hero__lead">
          <div className="token-mobile-hero__logo-wrap">
            <TokenAvatar
              address={token.address}
              symbol={token.symbol}
              logoUrl={token.logoUrl}
              size={40}
              shape="rounded"
              className="token-mobile-hero__logo shrink-0"
            />
          </div>

          <div className="token-mobile-hero__identity">
            <span className="token-mobile-hero__token-name">{token.name}</span>

            <div className="token-mobile-hero__address-row">
              <span className="token-mobile-hero__address financial-value">
                {shortAddress(token.address, true)}
              </span>
              <div className="token-mobile-hero__address-actions">
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="token-mobile-hero__copy-btn"
                  aria-label={copiedAddress ? "Address copied" : "Copy contract address"}
                >
                  <PumpIcon
                    icon={copiedAddress ? faCheck : faCopy}
                    className="token-mobile-hero__copy-icon"
                    aria-hidden
                  />
                  {copiedAddress ? (
                    <span className="token-mobile-hero__copied-tip" role="status">
                      Copied
                    </span>
                  ) : null}
                </button>
                {showSocialLinks ? (
                  <div className="token-mobile-hero__address-links">
                    <TokenSocialLinksBar links={token.socialLinks} variant="toolbar" />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="token-mobile-hero__quote">
          <div className="token-mobile-hero__price">
            <HeroQuoteMetric
              chartCurrency={chartCurrency}
              priceUsd={priceUsd}
              mcapUsd={mcapUsd}
            />
          </div>
          <p className={changeToneClass(changePct)}>{formatChangePct(changePct)}</p>
        </div>
      </div>
    </div>
  );
}
