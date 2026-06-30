"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/user/UserAvatar";
import { PctChange } from "@/components/ui/PctChange";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { shortAddress } from "@/config/chain";
import { formatPortfolioHoldingValueUsd, formatUsdReadable } from "@/lib/format-usd";
import { PumpIcon, faArrowTrendUp } from "@/lib/icons";

type PortfolioHeroProps = {
  walletAddress: string;
  avatarId: string | null;
  onEditAvatar: () => void;
  onOpenFollowing: () => void;
  onOpenFollowers: () => void;
  followingCount: number;
  followerCount: number;
  totalValueUsd: number | null;
  totalNetPnlUsd: number;
  portfolioValuePct: number | null;
  holdingsCount: number;
  totalUnrealizedPnlUsd: number;
  totalRealizedPnlUsd: number;
  valueFlashClass?: string;
  pnlFlashClass?: string;
};

function pnlTone(value: number): string {
  if (value > 0) return "text-pump-success";
  if (value < 0) return "text-pump-danger";
  return "text-pump-text";
}

export function PortfolioHero({
  walletAddress,
  avatarId,
  onEditAvatar,
  onOpenFollowing,
  onOpenFollowers,
  followingCount,
  followerCount,
  totalValueUsd,
  totalNetPnlUsd,
  portfolioValuePct,
  holdingsCount,
  totalUnrealizedPnlUsd,
  totalRealizedPnlUsd,
  valueFlashClass = "",
  pnlFlashClass = "",
}: PortfolioHeroProps) {
  const { openDeposit, openWithdraw } = useWalletFunding();
  const displayValue =
    totalValueUsd != null && Number.isFinite(totalValueUsd)
      ? formatPortfolioHoldingValueUsd(totalValueUsd)
      : "$0.00";

  return (
    <section className="portfolio-hub-hero panel-surface">
      <div className="portfolio-hub-hero__value-block">
        <p className="portfolio-hub-hero__kicker">Total portfolio value</p>
        <div className="portfolio-hub-hero__value-row">
          <p className={`portfolio-hub-hero__value financial-value ${valueFlashClass}`}>
            {displayValue}
          </p>
          <PctChange
            value={portfolioValuePct}
            className="text-body-sm font-semibold"
            toneClassName={pnlTone(portfolioValuePct ?? totalNetPnlUsd)}
          />
        </div>
        <p className={`portfolio-hub-hero__pnl financial-value ${pnlTone(totalNetPnlUsd)} ${pnlFlashClass}`}>
          {formatUsdReadable(totalNetPnlUsd, { compact: true, signed: true, fallback: "$0.00" })}{" "}
          all-time PnL
        </p>
      </div>

      <div className="portfolio-hub-hero__stats">
        <div className="portfolio-hub-hero__stat">
          <span className="portfolio-hub-hero__stat-label">Positions</span>
          <span className="portfolio-hub-hero__stat-value financial-value">{holdingsCount}</span>
        </div>
        <div className="portfolio-hub-hero__stat">
          <span className="portfolio-hub-hero__stat-label">Unrealized</span>
          <span
            className={`portfolio-hub-hero__stat-value financial-value ${pnlTone(totalUnrealizedPnlUsd)}`}
          >
            {formatUsdReadable(totalUnrealizedPnlUsd, {
              compact: true,
              signed: true,
              fallback: "$0.00",
            })}
          </span>
        </div>
        <div className="portfolio-hub-hero__stat">
          <span className="portfolio-hub-hero__stat-label">Realized</span>
          <span className={`portfolio-hub-hero__stat-value financial-value ${pnlTone(totalRealizedPnlUsd)}`}>
            {formatUsdReadable(totalRealizedPnlUsd, {
              compact: true,
              signed: true,
              fallback: "$0.00",
            })}
          </span>
        </div>
      </div>

      <div className="portfolio-hub-hero__actions">
        <button type="button" onClick={openDeposit} className="primary-button portfolio-hub-hero__action-btn">
          Deposit
        </button>
        <button type="button" onClick={openWithdraw} className="secondary-button portfolio-hub-hero__action-btn">
          Withdraw
        </button>
        <Link href="/trade" className="secondary-button portfolio-hub-hero__action-btn portfolio-hub-hero__action-link">
          <PumpIcon icon={faArrowTrendUp} className="h-4 w-4 shrink-0 opacity-80" />
          Trade
        </Link>
      </div>

      <div className="portfolio-hub-hero__profile">
        <button
          type="button"
          onClick={onEditAvatar}
          className="portfolio-hub-hero__avatar-btn"
          aria-label="Change avatar"
        >
          {avatarId ? (
            <UserAvatar address={walletAddress} avatarId={avatarId} size={36} />
          ) : (
            <span className="portfolio-hub-hero__avatar-fallback" aria-hidden>
              {walletAddress.slice(2, 4).toUpperCase()}
            </span>
          )}
        </button>
        <div className="portfolio-hub-hero__profile-meta">
          <p className="portfolio-hub-hero__address financial-value">{shortAddress(walletAddress)}</p>
          <div className="portfolio-hub-hero__social">
            <button type="button" onClick={onOpenFollowing} className="portfolio-hub-hero__social-link">
              {followingCount} following
            </button>
            <span className="text-pump-muted" aria-hidden>
              ·
            </span>
            <button type="button" onClick={onOpenFollowers} className="portfolio-hub-hero__social-link">
              {followerCount} followers
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
