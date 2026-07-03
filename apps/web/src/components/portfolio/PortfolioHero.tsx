"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PctChange } from "@/components/ui/PctChange";
import { IconLabel } from "@/components/ui/IconLabel";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import {
  formatPortfolioHoldingValueUsd,
  formatUsdSignedTwoDecimals,
} from "@/lib/format-usd";
import { PumpIcon, faPen } from "@/lib/icons";
import { MetricIcons } from "@/lib/metric-icons";
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
  labelSuffix,
  children,
  hero = false,
  className = "",
}: {
  label: string;
  labelSuffix?: ReactNode;
  children: ReactNode;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div className={`portfolio-stat${hero ? " portfolio-stat--hero" : ""} ${className}`.trim()}>
      <div className="portfolio-stat__label-row">
        <span className="portfolio-stat__label">{label}</span>
        {labelSuffix != null ? (
          <span className="portfolio-stat__label-suffix">{labelSuffix}</span>
        ) : null}
      </div>
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

  const estPnlValue = guestMode ? (
    guestZeroUsd
  ) : (
    <span className={`portfolio-stat__pnl-inline ${pnlFlashClass}`.trim()}>
      <span className={pnlTone(totalNetPnlUsd)}>
        {formatUsdSignedTwoDecimals(totalNetPnlUsd)}
      </span>
      <PctChange
        value={portfolioValuePct}
        toneClassName={pnlPctTone}
        className="portfolio-stat__inline-pct hidden md:inline-flex"
      />
    </span>
  );

  const estPnlMobileValue = guestMode ? (
    guestZeroUsd
  ) : (
    <span className={pnlFlashClass}>
      <span className={pnlTone(totalNetPnlUsd)}>
        {formatUsdSignedTwoDecimals(totalNetPnlUsd)}
      </span>
    </span>
  );

  return (
    <header className="portfolio-header">
      <div className="portfolio-toolbar">
        <div className="portfolio-toolbar__shell">
          <div className="portfolio-toolbar__identity-row">
            <div className="portfolio-toolbar__identity">
              {guestMode ? (
                <div className="portfolio-toolbar__guest-avatar" aria-hidden />
              ) : (
                <UserAvatarForAddress
                  address={walletAddress}
                  size={32}
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

            <PortfolioStat
              label="Total Value"
              hero
              className="portfolio-toolbar__total-value portfolio-toolbar__total-value--desktop"
            >
              <span className={valueFlashClass}>{displayValue}</span>
            </PortfolioStat>
          </div>

          <div className="portfolio-toolbar__hero-row portfolio-toolbar__hero-row--mobile">
            <div className="portfolio-toolbar__value-block">
              <IconLabel
                icon={MetricIcons.portfolioValue}
                hideIconMobile
                className="section-label"
              >
                Total Value
              </IconLabel>
              <p className={`portfolio-toolbar__value-hero financial-value ${valueFlashClass}`.trim()}>
                {displayValue}
              </p>
            </div>

            <div className="portfolio-toolbar__pnl-stack">
              <PortfolioStat label="Est. PnL" className="portfolio-toolbar__pnl-stack-stat">
                {estPnlMobileValue}
              </PortfolioStat>
              <PortfolioStat label="Unrealized PnL" className="portfolio-toolbar__pnl-stack-stat">
                {guestMode ? (
                  guestZeroUsd
                ) : (
                  <span className={pnlTone(totalUnrealizedPnlUsd)}>
                    {formatUsdSignedTwoDecimals(totalUnrealizedPnlUsd)}
                  </span>
                )}
              </PortfolioStat>
              <PortfolioStat label="Realized PnL" className="portfolio-toolbar__pnl-stack-stat">
                {guestMode ? (
                  guestZeroUsd
                ) : (
                  <span className={pnlTone(totalRealizedPnlUsd)}>
                    {formatUsdSignedTwoDecimals(totalRealizedPnlUsd)}
                  </span>
                )}
              </PortfolioStat>
            </div>
          </div>

          <div className="portfolio-toolbar__divider portfolio-toolbar__divider--desktop" aria-hidden />

          <div className="portfolio-toolbar__pnl-actions">
            <div className="portfolio-toolbar__pnl-row portfolio-toolbar__pnl-row--desktop">
              <PortfolioStat
                label="Est. PnL"
                labelSuffix={
                  !guestMode ? (
                    <PctChange
                      value={portfolioValuePct}
                      toneClassName={pnlPctTone}
                      className="portfolio-stat__label-pct md:hidden"
                    />
                  ) : null
                }
              >
                {estPnlValue}
              </PortfolioStat>
              <PortfolioStat label="Unrealized Pnl">
                {guestMode ? (
                  guestZeroUsd
                ) : (
                  <span className={pnlTone(totalUnrealizedPnlUsd)}>
                    {formatUsdSignedTwoDecimals(totalUnrealizedPnlUsd)}
                  </span>
                )}
              </PortfolioStat>
              <PortfolioStat label="Realized Pnl">
                {guestMode ? (
                  guestZeroUsd
                ) : (
                  <span className={pnlTone(totalRealizedPnlUsd)}>
                    {formatUsdSignedTwoDecimals(totalRealizedPnlUsd)}
                  </span>
                )}
              </PortfolioStat>
            </div>

            <div className="portfolio-toolbar__actions-row">
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
      </div>
    </header>
  );
}
