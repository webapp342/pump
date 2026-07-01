"use client";

import { TokenBoardTable } from "@/components/arena/TokenBoardTable";
import { PortfolioHero } from "@/components/portfolio/PortfolioHero";
import { PortfolioFeesBreakdown } from "@/components/portfolio/PortfolioFeesBreakdown";
import { PortfolioMetricBox } from "@/components/portfolio/PortfolioMetricBox";
import { PortfolioTabNav } from "@/components/portfolio/PortfolioTabNav";
import { formatUsdSignedTwoDecimals } from "@/lib/format-usd";
import type { PortfolioTab } from "@/lib/portfolio-tabs";

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
          Track holdings, creator fees, launched tokens, and airdrop rewards after you sign in.
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
        <col className="portfolio-holdings-grid__col-amount" />
        <col className="portfolio-holdings-grid__col-value" />
        <col className="portfolio-holdings-grid__col-entry" />
        <col className="portfolio-holdings-grid__col-pnl" />
        <col className="portfolio-holdings-grid__col-trade" />
      </colgroup>
      <thead>
        <tr>
          <th>Coin</th>
          <th className="portfolio-holdings-grid__num">Amount</th>
          <th className="portfolio-holdings-grid__num">Value</th>
          <th className="portfolio-holdings-grid__num">Entry</th>
          <th className="portfolio-holdings-grid__num">P/L</th>
          <th className="portfolio-holdings-grid__trade">Trade</th>
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
      <section className="panel-surface portfolio-section-surface hidden lg:block">
        <TokenBoardTable tokens={[]} bnbUsd={null} variant="created" />
      </section>
      <GuestSignInFooter onSignIn={onSignIn} />
    </div>
  );
}

function GuestFeesTab({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="portfolio-fees-tab">
      <div className="portfolio-fees-tab__grid">
        <PortfolioMetricBox
          className="portfolio-fees-tab__card"
          label="Creator fees"
          value={<PortfolioFeesBreakdown availableBnb={0} claimedBnb={0} bnbUsd={null} />}
          valueClassName=""
          actionsInlineFromMd
          actions={
            <button type="button" onClick={onSignIn} className="secondary-button">
              Claim
            </button>
          }
        />
        <PortfolioMetricBox
          className="portfolio-fees-tab__card"
          label="Referral fees"
          value={<PortfolioFeesBreakdown availableBnb={0} claimedBnb={0} bnbUsd={null} />}
          valueClassName=""
          actions={
            <button type="button" onClick={onSignIn} className="secondary-button">
              Claim
            </button>
          }
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
      <div className="portfolio-hub">
        <PortfolioHero
          walletAddress={GUEST_WALLET}
          displayUsername=""
          guestMode
          onSignIn={onSignIn}
          canEditProfile={false}
          onOpenProfileEditor={() => {}}
          onOpenFollowing={() => onSignIn()}
          onOpenFollowers={() => onSignIn()}
          followingCount={0}
          followerCount={0}
          totalValueUsd={0}
          totalNetPnlUsd={0}
          portfolioValuePct={null}
          totalUnrealizedPnlUsd={0}
          totalRealizedPnlUsd={0}
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
