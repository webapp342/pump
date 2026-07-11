"use client";

import { PortfolioEarningsCard } from "@/components/portfolio/PortfolioEarningsCard";
import { PortfolioHero } from "@/components/portfolio/PortfolioHero";
import { PortfolioLaunchedList } from "@/components/portfolio/PortfolioLaunchedList";
import { PortfolioMobileHero } from "@/components/portfolio/PortfolioMobileHero";
import { PortfolioSummaryStrip } from "@/components/portfolio/PortfolioSummaryStrip";
import { PortfolioTabNav } from "@/components/portfolio/PortfolioTabNav";
import { formatUsdSignedTwoDecimals } from "@/lib/format-usd";
import type { PortfolioTab } from "@/lib/portfolio-tabs";
import { PORTFOLIO_EARNINGS_CARD_LABELS } from "@/lib/portfolio-tabs";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

const GUEST_WALLET = "0x0000000000000000000000000000000000000000";
const GUEST_ZERO_USD = formatUsdSignedTwoDecimals(0);

type PortfolioGuestPanelProps = {
  activeTab: PortfolioTab;
  onSignIn: () => void;
};

function GuestZero({ className = "" }: { className?: string }) {
  return <span className={`financial-value text-pump-text ${className}`.trim()}>0</span>;
}

function GuestSignInFooter({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="portfolio-sign-in-banner portfolio-sign-in-banner--tab-footer">
      <div className="portfolio-sign-in-banner__copy">
        <p className="portfolio-sign-in-banner__title">Sign in to unlock your portfolio</p>
        <p className="portfolio-sign-in-banner__desc">
          Track holdings, creator earnings, launched tokens, and airdrop rewards after you sign in.
        </p>
      </div>
      <button type="button" onClick={onSignIn} className="primary-button portfolio-sign-in-banner__cta">
        Sign in
      </button>
    </div>
  );
}

function GuestHoldingsTable() {
  return (
    <table className="sheet-grid portfolio-holdings-grid">
      <colgroup>
        <col className="portfolio-holdings-grid__col-coin" />
        <col className="portfolio-holdings-grid__col-actions" />
        <col className="portfolio-holdings-grid__col-amount" />
        <col className="portfolio-holdings-grid__col-value" />
        <col className="portfolio-holdings-grid__col-entry" />
        <col className="portfolio-holdings-grid__col-pnl" />
      </colgroup>
      <thead>
        <tr>
          <th>Coin</th>
          <th className="portfolio-holdings-grid__actions-head" aria-label="Actions" />
          <th className="portfolio-holdings-grid__num">Amount</th>
          <th className="portfolio-holdings-grid__num">Value</th>
          <th className="portfolio-holdings-grid__num">Entry</th>
          <th className="portfolio-holdings-grid__num">P/L</th>
        </tr>
      </thead>
      <tbody />
    </table>
  );
}

function GuestHoldingsTab({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="portfolio-guest-tab">
      <section className="panel-surface portfolio-section-surface hidden lg:block">
        <GuestHoldingsTable />
      </section>
      <GuestSignInFooter onSignIn={onSignIn} />
    </div>
  );
}

function GuestLaunchedTab({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="portfolio-guest-tab">
      <section className="panel-surface portfolio-section-surface">
        <PortfolioLaunchedList tokens={[]} bnbUsd={null} holdingMetricsByAddress={{}} />
      </section>
      <GuestSignInFooter onSignIn={onSignIn} />
    </div>
  );
}

function GuestFeesTab({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="portfolio-earnings-tab">
      <div className="portfolio-earnings-tab__stack">
        <PortfolioEarningsCard
          className="portfolio-earnings-tab__card"
          title={PORTFOLIO_EARNINGS_CARD_LABELS.creator}
          description="From tokens you launched on the bonding curve."
          availableBnb={0}
          claimedBnb={0}
          bnbUsd={null}
          onClaim={onSignIn}
        />
        <PortfolioEarningsCard
          className="portfolio-earnings-tab__card"
          title={PORTFOLIO_EARNINGS_CARD_LABELS.referral}
          description="When friends trade through your invite link."
          availableBnb={0}
          claimedBnb={0}
          bnbUsd={null}
          onClaim={onSignIn}
          claimLabel="Sign in"
        />
      </div>
    </div>
  );
}

function GuestAirdropsTab({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="portfolio-guest-tab">
      <section className="panel-surface portfolio-rewards-section hidden lg:block">
        <div className="portfolio-guest-airdrops-placeholder flex">
          <span className="portfolio-guest-airdrops-placeholder__label section-label text-pump-muted">
            Joined airdrops
          </span>
          <GuestZero className="text-body-sm" />
        </div>
      </section>
      <GuestSignInFooter onSignIn={onSignIn} />
    </div>
  );
}

export function PortfolioGuestPanel({ activeTab, onSignIn }: PortfolioGuestPanelProps) {
  return (
    <div className="portfolio-page">
      <HubDiscoveryScrollLock />
      <div className="portfolio-hub">
        <PortfolioMobileHero
          walletAddress={GUEST_WALLET}
          displayUsername=""
          guestMode
          canEditProfile={false}
          onOpenProfileEditor={() => {}}
          totalValueUsd={0}
          onSignIn={onSignIn}
        />

        <PortfolioHero
          walletAddress={GUEST_WALLET}
          displayUsername=""
          guestMode
          canEditProfile={false}
          onOpenProfileEditor={() => {}}
          onOpenFollowing={() => onSignIn()}
          onOpenFollowers={() => onSignIn()}
          followingCount={0}
          followerCount={0}
        />

        <PortfolioSummaryStrip
          totalValueUsd={0}
          totalNetPnlUsd={0}
          totalNetPnlPct={null}
          topHolding={null}
          coinsHeld={0}
          guestMode
        />

        <PortfolioTabNav active={activeTab} />

        <div className="portfolio-hub__body">
          {activeTab === "holdings" ? <GuestHoldingsTab onSignIn={onSignIn} /> : null}
          {activeTab === "launched" ? <GuestLaunchedTab onSignIn={onSignIn} /> : null}
          {activeTab === "fees" ? <GuestFeesTab onSignIn={onSignIn} /> : null}
          {activeTab === "airdrops" ? <GuestAirdropsTab onSignIn={onSignIn} /> : null}
        </div>
      </div>
    </div>
  );
}
