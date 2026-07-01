"use client";

import Link from "next/link";
import { useState } from "react";
import { PctChange } from "@/components/ui/PctChange";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { explorerAddressUrl, shortAddress } from "@/config/chain";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { formatPortfolioHoldingValueUsd, formatUsdReadable } from "@/lib/format-usd";
import { PumpIcon, faCheck, faCopy, faExternalLink } from "@/lib/icons";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";

type PortfolioHeroProps = {
  walletAddress: string;
  onOpenAvatarPicker: () => void;
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
  if (value > 0) return "token-detail-toolbar__stat-value--up";
  if (value < 0) return "token-detail-toolbar__stat-value--down";
  return "";
}

function Stat({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`token-detail-toolbar__stat ${className}`}>
      <span className="token-detail-toolbar__stat-label">{label}</span>
      <div className="token-detail-toolbar__stat-value financial-value">{children}</div>
    </div>
  );
}

export function PortfolioHero({
  walletAddress,
  onOpenAvatarPicker,
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
  const [copiedAddress, setCopiedAddress] = useState(false);
  const displayValue =
    totalValueUsd != null && Number.isFinite(totalValueUsd)
      ? formatPortfolioHoldingValueUsd(totalValueUsd)
      : "$0.00";

  async function onCopyAddress() {
    const ok = await copyToClipboard(walletAddress);
    if (!ok) return;
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }

  return (
    <header className="portfolio-hub-hero">
      <div className="token-detail-toolbar">
        <div className="token-detail-toolbar__row">
          <div className="token-detail-toolbar__identity">
            <button
              type="button"
              className="portfolio-hub-hero__avatar-btn"
              onClick={onOpenAvatarPicker}
              aria-label="Change avatar"
            >
              <UserAvatarForAddress
                address={walletAddress}
                size={28}
                className="token-detail-toolbar__logo shrink-0 !ring-0"
              />
            </button>
            <div className="token-detail-toolbar__pair-meta">
              <span className="token-detail-toolbar__stat-label">Portfolio</span>
              <span className={`token-detail-toolbar__symbol financial-value ${valueFlashClass}`}>
                {displayValue}
              </span>
              <div className="token-detail-toolbar__contract portfolio-hub-hero__wallet">
                <span className="token-detail-toolbar__age financial-value">
                  {shortAddress(walletAddress, true)}
                </span>
                <a
                  href={explorerAddressUrl(walletAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="token-detail-toolbar__contract-btn"
                  aria-label="View wallet on explorer"
                >
                  <PumpIcon icon={faExternalLink} className="h-[14px] w-[14px]" />
                </a>
                <button
                  type="button"
                  onClick={() => void onCopyAddress()}
                  className="token-detail-toolbar__contract-btn"
                  aria-label={copiedAddress ? "Address copied" : "Copy wallet address"}
                >
                  {copiedAddress ? (
                    <PumpIcon icon={faCheck} className="h-[14px] w-[14px]" />
                  ) : (
                    <PumpIcon icon={faCopy} className="h-[14px] w-[14px]" />
                  )}
                </button>
              </div>
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

          <div className="token-detail-toolbar__scroll">
            <div className="token-detail-toolbar__stats">
              <Stat label="PnL">
                <span className={`token-detail-toolbar__price-line ${pnlTone(totalNetPnlUsd)} ${pnlFlashClass}`}>
                  {formatUsdReadable(totalNetPnlUsd, {
                    compact: true,
                    signed: true,
                    fallback: "$0.00",
                  })}
                  <PctChange
                    value={portfolioValuePct}
                    toneClassName={
                      portfolioValuePct != null && portfolioValuePct > 0
                        ? "text-pump-success"
                        : portfolioValuePct != null && portfolioValuePct < 0
                          ? "text-pump-danger"
                          : "text-pump-muted"
                    }
                  />
                </span>
              </Stat>
              <Stat label="Positions">{holdingsCount}</Stat>
              <Stat label="Unrealized">
                <span className={pnlTone(totalUnrealizedPnlUsd)}>
                  {formatUsdReadable(totalUnrealizedPnlUsd, {
                    compact: true,
                    signed: true,
                    fallback: "$0.00",
                  })}
                </span>
              </Stat>
              <Stat label="Realized">
                <span className={pnlTone(totalRealizedPnlUsd)}>
                  {formatUsdReadable(totalRealizedPnlUsd, {
                    compact: true,
                    signed: true,
                    fallback: "$0.00",
                  })}
                </span>
              </Stat>
            </div>
          </div>

          <div className="token-detail-toolbar__actions">
            <div className="portfolio-hub-hero__actions">
              <button type="button" onClick={openDeposit} className="portfolio-hub-hero__action portfolio-hub-hero__action--primary">
                Deposit
              </button>
              <button type="button" onClick={openWithdraw} className="portfolio-hub-hero__action">
                Withdraw
              </button>
              <Link href="/" className="portfolio-hub-hero__action">
                Trade
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
