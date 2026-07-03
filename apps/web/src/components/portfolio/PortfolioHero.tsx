"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PctChange } from "@/components/ui/PctChange";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import {
  formatPortfolioHoldingValueUsd,
  formatUsdSignedTwoDecimals,
} from "@/lib/format-usd";
import { PumpIcon, faChevronDown, faPen } from "@/lib/icons";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";

type PortfolioHeroProps = {
  walletAddress: string;
  displayUsername: string;
  canEditProfile: boolean;
  onOpenProfileEditor: () => void;
  onOpenFollowing: () => void;
  onOpenFollowers: () => void;
  followingCount: number;
  followerCount: number;
  totalValueUsd: number | null;
  totalNetPnlUsd: number;
  portfolioValuePct: number | null;
  totalUnrealizedPnlUsd: number;
  totalRealizedPnlUsd: number;
  valueFlashClass?: string;
  pnlFlashClass?: string;
  guestMode?: boolean;
  onSignIn?: () => void;
};

function pnlTone(value: number): string {
  if (value > 0) return "portfolio-stat__value--up";
  if (value < 0) return "portfolio-stat__value--down";
  return "";
}

function PortfolioStat({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`portfolio-stat ${className}`.trim()}>
      <span className="portfolio-stat__label">{label}</span>
      <div className="portfolio-stat__value financial-value">{children}</div>
    </div>
  );
}

export function PortfolioHero({
  walletAddress,
  displayUsername,
  canEditProfile,
  onOpenProfileEditor,
  onOpenFollowing,
  onOpenFollowers,
  followingCount,
  followerCount,
  totalValueUsd,
  totalNetPnlUsd,
  portfolioValuePct,
  totalUnrealizedPnlUsd,
  totalRealizedPnlUsd,
  valueFlashClass = "",
  pnlFlashClass = "",
  guestMode = false,
  onSignIn,
}: PortfolioHeroProps) {
  const { openDeposit, openWithdraw } = useWalletFunding();
  const [pnlDetailsOpen, setPnlDetailsOpen] = useState(false);
  const guestZeroUsd = formatUsdSignedTwoDecimals(0);

  const displayValue =
    guestMode || (totalValueUsd != null && Number.isFinite(totalValueUsd))
      ? guestMode
        ? formatPortfolioHoldingValueUsd(0)
        : formatPortfolioHoldingValueUsd(totalValueUsd!)
      : "$0.00";

  const pnlPctTone =
    portfolioValuePct != null && portfolioValuePct > 0
      ? "text-pump-success"
      : portfolioValuePct != null && portfolioValuePct < 0
        ? "text-pump-danger"
        : "text-pump-muted";

  const estPnlRow = guestMode ? (
    guestZeroUsd
  ) : (
    <span className={`portfolio-summary-card__change-row ${pnlFlashClass}`.trim()}>
      <span className={`financial-value ${pnlTone(totalNetPnlUsd)}`}>
        {formatUsdSignedTwoDecimals(totalNetPnlUsd)}
      </span>
      <PctChange
        value={portfolioValuePct}
        toneClassName={pnlPctTone}
        className="portfolio-summary-card__change-pct"
      />
      <span className="portfolio-summary-card__change-label">est. PnL</span>
    </span>
  );

  return (
    <header className="portfolio-header">
      <div className="portfolio-toolbar">
        <div className="portfolio-summary-card panel-surface">
          <div className="portfolio-summary-card__identity">
            {guestMode ? (
              <div className="portfolio-toolbar__guest-avatar" aria-hidden />
            ) : (
              <UserAvatarForAddress
                address={walletAddress}
                size={36}
                className="token-detail-toolbar__logo shrink-0 !ring-0"
              />
            )}
            <div className="portfolio-toolbar__identity-meta">
              <div className="portfolio-toolbar__name-line">
                <span
                  className={
                    guestMode
                      ? "portfolio-toolbar__display-name portfolio-toolbar__display-name--guest"
                      : "portfolio-toolbar__display-name"
                  }
                >
                  {guestMode ? "—" : displayUsername}
                </span>
                {canEditProfile ? (
                  <button
                    type="button"
                    onClick={onOpenProfileEditor}
                    className="portfolio-toolbar__edit-profile"
                    aria-label="Edit profile"
                  >
                    <PumpIcon icon={faPen} className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                ) : null}
              </div>
              <span className="token-detail-toolbar__age portfolio-toolbar__social">
                {guestMode ? (
                  <>
                    <span>0 following</span>
                    <span aria-hidden>·</span>
                    <span>0 followers</span>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={onOpenFollowing} className="portfolio-toolbar__social-link">
                      {followingCount} following
                    </button>
                    <span aria-hidden>·</span>
                    <button type="button" onClick={onOpenFollowers} className="portfolio-toolbar__social-link">
                      {followerCount} followers
                    </button>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="portfolio-summary-card__metrics">
            <p className="section-label portfolio-summary-card__value-label">Total Value</p>
            <p className={`portfolio-summary-card__value financial-value ${valueFlashClass}`.trim()}>
              {displayValue}
            </p>
            {estPnlRow}
          </div>

          {!guestMode ? (
            <div className="portfolio-summary-card__details">
              <button
                type="button"
                className="portfolio-summary-card__details-toggle"
                aria-expanded={pnlDetailsOpen}
                onClick={() => setPnlDetailsOpen((open) => !open)}
              >
                <span>PnL breakdown</span>
                <PumpIcon
                  icon={faChevronDown}
                  className={`portfolio-summary-card__details-chevron${pnlDetailsOpen ? " portfolio-summary-card__details-chevron--open" : ""}`}
                  aria-hidden
                />
              </button>
              {pnlDetailsOpen ? (
                <div className="portfolio-summary-card__details-grid">
                  <PortfolioStat label="Unrealized PnL">
                    <span className={pnlTone(totalUnrealizedPnlUsd)}>
                      {formatUsdSignedTwoDecimals(totalUnrealizedPnlUsd)}
                    </span>
                  </PortfolioStat>
                  <PortfolioStat label="Realized PnL">
                    <span className={pnlTone(totalRealizedPnlUsd)}>
                      {formatUsdSignedTwoDecimals(totalRealizedPnlUsd)}
                    </span>
                  </PortfolioStat>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="portfolio-summary-card__footnote text-caption text-pump-muted">
            Estimated values · not tax or financial advice
          </p>

          <div className="portfolio-toolbar__actions-row portfolio-summary-card__actions">
            <button
              type="button"
              onClick={guestMode ? () => onSignIn?.() : openDeposit}
              className="token-toolbar-btn portfolio-toolbar__btn--primary"
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={guestMode ? () => onSignIn?.() : openWithdraw}
              className="token-toolbar-btn"
            >
              Withdraw
            </button>
            <Link href="/" className="token-toolbar-btn">
              Trade
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
