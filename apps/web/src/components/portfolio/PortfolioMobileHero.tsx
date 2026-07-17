"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { AccountSheet } from "@/components/wallet/AccountSheet";
import { CreateChoiceSheet } from "@/components/create/CreateChoiceSheet";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { shortAddress } from "@/config/chain";
import { useWalletTotalBalance } from "@/hooks/useWalletTotalBalance";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { formatPortfolioHoldingValueUsd, formatUsdSignedTwoDecimals } from "@/lib/format-usd";
import {
  PumpIcon,
  faBolt,
  faCheck,
  faCopy,
  faDeposit,
  faMenu,
  faPlus,
  faShare,
  faWithdraw,
} from "@/lib/icons";
import { portfolioSharePayload } from "@/lib/share-links";
import { PctChange } from "@/components/ui/PctChange";
import { USER_AVATAR_SIZE } from "@/lib/ui-sizes";

type PortfolioMobileHeroProps = {
  walletAddress: string;
  displayUsername: string;
  hasStatusBadge?: boolean;
  canEditProfile: boolean;
  onOpenProfileEditor: () => void;
  totalValueUsd: number | null;
  totalNetPnlUsd?: number;
  totalNetPnlPct?: number | null;
  valueFlashClass?: string;
  guestMode?: boolean;
  onSignIn?: () => void;
  showWalletActions?: boolean;
};

function formatHeroUsername(name: string, guestMode: boolean): string {
  if (guestMode || !name) return "—";
  if (name.startsWith("0x")) return shortAddress(name, true);
  return name.startsWith("@") ? name : `@${name}`;
}

function MobileIdentityCopy({
  address,
  guestMode,
}: {
  address: string;
  guestMode?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (guestMode) return null;

  async function onCopy() {
    const ok = await copyToClipboard(address);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="portfolio-mobile-hero__copy"
      aria-label={copied ? "Address copied" : "Copy wallet address"}
    >
      <PumpIcon
        icon={copied ? faCheck : faCopy}
        className="portfolio-mobile-hero__copy-icon"
      />
    </button>
  );
}

function MobileHeroPnl({
  usd,
  pct,
}: {
  usd: number;
  pct: number | null;
}) {
  const tone =
    usd > 0
      ? "portfolio-mobile-hero__pnl--up"
      : usd < 0
        ? "portfolio-mobile-hero__pnl--down"
        : "portfolio-mobile-hero__pnl--flat";

  return (
    <p className={`portfolio-mobile-hero__pnl ${tone}`}>
      <span className="financial-value">{formatUsdSignedTwoDecimals(usd)}</span>
      {pct != null ? (
        <>
          <span aria-hidden> · </span>
          <PctChange value={pct} className="portfolio-mobile-hero__pnl-pct" />
        </>
      ) : null}
    </p>
  );
}

export function PortfolioMobileHero({
  walletAddress,
  displayUsername,
  hasStatusBadge = false,
  canEditProfile,
  onOpenProfileEditor,
  totalValueUsd,
  totalNetPnlUsd = 0,
  totalNetPnlPct = null,
  valueFlashClass = "",
  guestMode = false,
  onSignIn,
  showWalletActions = false,
}: PortfolioMobileHeroProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [showBnb, setShowBnb] = useState(false);
  const { openDeposit, openWithdraw } = useWalletFunding();
  const { scwAddress, logout } = usePumpWallet();
  const accountAddress = (scwAddress ?? walletAddress) as `0x${string}`;
  const { nativeBnb, nativeUsd } = useWalletTotalBalance(accountAddress);

  const sharePayload = useMemo(
    () =>
      guestMode ? null : portfolioSharePayload(walletAddress, displayUsername),
    [displayUsername, guestMode, walletAddress]
  );

  const balanceLabel =
    guestMode || totalValueUsd == null
      ? "—"
      : formatPortfolioHoldingValueUsd(totalValueUsd);

  const showPnl = !guestMode && totalValueUsd != null;

  function onAction(action: "deposit" | "withdraw" | "create") {
    if (guestMode) {
      onSignIn?.();
      return;
    }
    if (!showWalletActions && action !== "create") {
      onSignIn?.();
      return;
    }
    if (action === "deposit") {
      openDeposit();
      return;
    }
    if (action === "withdraw") {
      openWithdraw();
      return;
    }
    if (action === "create") {
      setCreateOpen(true);
    }
  }

  const openAccount = () => setAccountOpen(true);
  const canOpenAccount = !guestMode && showWalletActions;

  const accountPanelProps = {
    nativeBnb,
    nativeUsd,
    showBnb,
    onToggleBalanceUnit: () => setShowBnb((value) => !value),
    onClose: () => setAccountOpen(false),
    onLogout: () => void logout(),
    onEditProfile: canEditProfile ? onOpenProfileEditor : undefined,
  };

  const avatarSize = USER_AVATAR_SIZE.lg;

  return (
    <>
      <section className="portfolio-mobile-hero md:hidden" aria-label="Portfolio overview">
        <div className="portfolio-mobile-hero__top">
          <div className="portfolio-mobile-hero__profile">
            <div className="portfolio-mobile-hero__avatar-wrap">
              {guestMode ? (
                <div className="portfolio-mobile-hero__guest-avatar" aria-hidden />
              ) : canOpenAccount ? (
                <button
                  type="button"
                  onClick={openAccount}
                  className="portfolio-mobile-hero__avatar-btn"
                  aria-label="Open settings"
                >
                  <UserAvatarForAddress
                    address={walletAddress}
                    size={avatarSize}
                    framed={hasStatusBadge && !guestMode}
                    className="portfolio-mobile-hero__avatar"
                  />
                </button>
              ) : (
                <UserAvatarForAddress
                  address={walletAddress}
                  size={avatarSize}
                  framed={hasStatusBadge && !guestMode}
                  className="portfolio-mobile-hero__avatar"
                />
              )}
            </div>

            <div className="portfolio-mobile-hero__identity">
              {canOpenAccount ? (
                <button
                  type="button"
                  onClick={openAccount}
                  className={`portfolio-mobile-hero__username portfolio-mobile-hero__username--btn${
                    hasStatusBadge && !guestMode ? " identity-name--premium" : ""
                  }`}
                  aria-label="Open settings"
                >
                  {formatHeroUsername(displayUsername, guestMode)}
                </button>
              ) : (
                <p
                  className={`portfolio-mobile-hero__username${
                    hasStatusBadge && !guestMode ? " identity-name--premium" : ""
                  }`}
                >
                  {formatHeroUsername(displayUsername, guestMode)}
                </p>
              )}
              <MobileIdentityCopy address={walletAddress} guestMode={guestMode} />
            </div>
          </div>

          {!guestMode ? (
            <div className="portfolio-mobile-hero__toolbar">
              {showWalletActions ? (
                <Link href="/missions" className="portfolio-mobile-hero__toolbar-btn" aria-label="Rewards">
                  <PumpIcon icon={faBolt} className="portfolio-mobile-hero__toolbar-icon" />
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="portfolio-mobile-hero__toolbar-btn"
                aria-label="Share profile"
              >
                <PumpIcon icon={faShare} className="portfolio-mobile-hero__toolbar-icon" />
              </button>
              {showWalletActions ? (
                <button
                  type="button"
                  onClick={() => setAccountOpen(true)}
                  className="portfolio-mobile-hero__toolbar-btn"
                  aria-label="Open settings"
                >
                  <PumpIcon icon={faMenu} className="portfolio-mobile-hero__toolbar-icon" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="portfolio-mobile-hero__balance-block">
          <p
            className={`portfolio-mobile-hero__balance financial-value ${valueFlashClass}`.trim()}
          >
            {balanceLabel}
          </p>
          {showPnl ? <MobileHeroPnl usd={totalNetPnlUsd} pct={totalNetPnlPct} /> : null}
        </div>

        {guestMode || showWalletActions ? (
          <div className="portfolio-mobile-hero__actions" role="group" aria-label="Wallet actions">
            <button
              type="button"
              onClick={() => onAction("deposit")}
              className="portfolio-mobile-hero__action"
            >
              <span className="portfolio-mobile-hero__action-icon" aria-hidden>
                <PumpIcon
                  icon={faDeposit}
                  className="portfolio-mobile-hero__action-glyph"
                  fixedWidth
                />
              </span>
              <span className="portfolio-mobile-hero__action-label">Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => onAction("withdraw")}
              className="portfolio-mobile-hero__action"
            >
              <span className="portfolio-mobile-hero__action-icon" aria-hidden>
                <PumpIcon
                  icon={faWithdraw}
                  className="portfolio-mobile-hero__action-glyph"
                  fixedWidth
                />
              </span>
              <span className="portfolio-mobile-hero__action-label">Withdraw</span>
            </button>
            <button
              type="button"
              onClick={() => onAction("create")}
              className="portfolio-mobile-hero__action"
            >
              <span className="portfolio-mobile-hero__action-icon" aria-hidden>
                <PumpIcon icon={faPlus} className="portfolio-mobile-hero__action-glyph" fixedWidth />
              </span>
              <span className="portfolio-mobile-hero__action-label">Create</span>
            </button>
          </div>
        ) : null}
      </section>

      {sharePayload ? (
        <ShareSheetModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          payload={sharePayload}
          title="Share profile"
        />
      ) : null}

      {showWalletActions ? (
        <AccountSheet open={accountOpen} {...accountPanelProps} />
      ) : null}

      {!guestMode ? (
        <CreateChoiceSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      ) : null}
    </>
  );
}
