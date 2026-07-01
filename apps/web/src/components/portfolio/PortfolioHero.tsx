"use client";

import Link from "next/link";
import { PctChange } from "@/components/ui/PctChange";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { shortAddress } from "@/config/chain";
import { formatPortfolioHoldingValueUsd, formatUsdReadable } from "@/lib/format-usd";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { PumpIcon, faChevronDown } from "@/lib/icons";

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
  if (value > 0) return "text-pump-success";
  if (value < 0) return "text-pump-danger";
  return "text-pump-muted";
}

function StatCell({
  label,
  children,
  column = "left",
  meta = false,
}: {
  label: string;
  children: React.ReactNode;
  column?: "left" | "mid" | "right";
  meta?: boolean;
}) {
  const body = (
    <>
      <span className="token-mobile-hero__stat-label">{label}</span>
      <div className="token-mobile-hero__stat-value">{children}</div>
    </>
  );

  return (
    <div
      className={`token-mobile-hero__stat-cell token-mobile-hero__stat-cell--${column}${
        meta ? " token-mobile-hero__stat-cell--meta" : ""
      }`}
    >
      {column === "mid" ? <div className="token-mobile-hero__stat-stack">{body}</div> : body}
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
  const displayValue =
    totalValueUsd != null && Number.isFinite(totalValueUsd)
      ? formatPortfolioHoldingValueUsd(totalValueUsd)
      : "$0.00";

  return (
    <section className="token-mobile-hero panel-surface">
      <div className="token-mobile-hero__top">
        <button
          type="button"
          className="token-mobile-hero__pair-select"
          onClick={onOpenAvatarPicker}
          aria-label="Change avatar"
        >
          <UserAvatarForAddress
            address={walletAddress}
            size={26}
            className="token-mobile-hero__logo shrink-0 !ring-0"
          />
          <span className="token-mobile-hero__symbol financial-value">
            {shortAddress(walletAddress)}
          </span>
          <PumpIcon icon={faChevronDown} className="token-mobile-hero__chevron" aria-hidden />
        </button>

        <div className="token-mobile-hero__quote">
          <div className={`token-mobile-hero__price ${valueFlashClass}`}>
            {displayValue}
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <p className={`token-mobile-hero__change ${pnlTone(totalNetPnlUsd)} ${pnlFlashClass}`}>
              {formatUsdReadable(totalNetPnlUsd, { compact: true, signed: true, fallback: "$0.00" })} PnL
            </p>
            <PctChange
              value={portfolioValuePct}
              className="token-mobile-hero__change"
              toneClassName={pnlTone(portfolioValuePct ?? totalNetPnlUsd)}
            />
          </div>
        </div>
      </div>

      <div className="token-mobile-hero__stats">
        <div className="token-mobile-hero__stats-bands">
          <div className="token-mobile-hero__stats-band">
            <StatCell label="Positions" column="left">
              <span className="financial-value">{holdingsCount}</span>
            </StatCell>
            <StatCell label="Unrealized" column="mid">
              <span className={`financial-value ${pnlTone(totalUnrealizedPnlUsd)}`}>
                {formatUsdReadable(totalUnrealizedPnlUsd, {
                  compact: true,
                  signed: true,
                  fallback: "$0.00",
                })}
              </span>
            </StatCell>
            <StatCell label="Realized" column="right">
              <span className={`financial-value ${pnlTone(totalRealizedPnlUsd)}`}>
                {formatUsdReadable(totalRealizedPnlUsd, {
                  compact: true,
                  signed: true,
                  fallback: "$0.00",
                })}
              </span>
            </StatCell>
          </div>
          <div className="token-mobile-hero__stats-band token-mobile-hero__stats-band--meta">
            <StatCell label="Network" column="left" meta>
              <div className="token-mobile-hero__links-value">
                <button type="button" onClick={onOpenFollowing} className="token-mobile-hero__creator-hit">
                  {followingCount} following
                </button>
                <span className="text-pump-muted mx-1">·</span>
                <button type="button" onClick={onOpenFollowers} className="token-mobile-hero__creator-hit">
                  {followerCount} followers
                </button>
              </div>
            </StatCell>
            <div className="token-mobile-hero__stat-cell token-mobile-hero__stat-cell--mid token-mobile-hero__stat-cell--meta" />
            <StatCell label="Actions" column="right" meta>
              <div className="flex items-center justify-end gap-2 w-full">
                <button type="button" onClick={openDeposit} className="chip-button chip-button-active text-[11px] px-2 py-1">
                  Deposit
                </button>
                <button type="button" onClick={openWithdraw} className="chip-button chip-button-ghost text-[11px] px-2 py-1">
                  Withdraw
                </button>
              </div>
            </StatCell>
          </div>
        </div>
      </div>
    </section>
  );
}
