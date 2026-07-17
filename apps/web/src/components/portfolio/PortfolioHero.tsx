"use client";

import { useMemo, useState } from "react";
import { ShareSheetModal } from "@/components/ui/ShareSheetModal";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { shortAddress } from "@/config/chain";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import {
  PumpIcon,
  faCheck,
  faCopy,
  faDeposit,
  faPen,
  faShare,
  faWithdraw,
} from "@/lib/icons";
import { portfolioSharePayload } from "@/lib/share-links";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";

type PortfolioHeroProps = {
  walletAddress: string;
  displayUsername: string;
  hasStatusBadge?: boolean;
  canEditProfile: boolean;
  onOpenProfileEditor: () => void;
  onOpenFollowing: () => void;
  onOpenFollowers: () => void;
  followingCount: number;
  followerCount: number;
  guestMode?: boolean;
  showWalletActions?: boolean;
};

function WalletAddressChip({
  address,
  guestMode,
}: {
  address: string;
  guestMode?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (guestMode) {
    return (
      <span className="portfolio-toolbar__wallet-address portfolio-toolbar__wallet-address--static">
        <span className="financial-value">—</span>
      </span>
    );
  }

  async function onCopy() {
    const ok = await copyToClipboard(address);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="portfolio-toolbar__wallet-address"
      aria-label={copied ? "Address copied" : "Copy wallet address"}
    >
      <span className="financial-value">{shortAddress(address, true)}</span>
      <PumpIcon icon={copied ? faCheck : faCopy} className="portfolio-toolbar__wallet-address-icon" />
    </button>
  );
}

function ProfileStatsRow({
  guestMode,
  followingCount,
  followerCount,
  onOpenFollowing,
  onOpenFollowers,
  variant,
}: {
  guestMode: boolean;
  followingCount: number;
  followerCount: number;
  onOpenFollowing: () => void;
  onOpenFollowers: () => void;
  variant: "mobile" | "desktop";
}) {
  const className =
    variant === "mobile"
      ? "portfolio-toolbar__stats portfolio-toolbar__stats--mobile"
      : "portfolio-toolbar__stats portfolio-toolbar__stats--desktop";

  if (guestMode) {
    return (
      <div className={className}>
        {variant === "desktop" ? (
          <>
            <span className="portfolio-toolbar__stat">
              <strong>0</strong> Followers
            </span>
            <span className="portfolio-toolbar__stat">
              <strong>0</strong> Following
            </span>
          </>
        ) : (
          <>
            <span className="portfolio-toolbar__stat">
              <strong>0</strong> Following
            </span>
            <span className="portfolio-toolbar__stat">
              <strong>0</strong> Followers
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {variant === "desktop" ? (
        <>
          <button type="button" onClick={onOpenFollowers} className="portfolio-toolbar__stat">
            <strong>{followerCount}</strong> Followers
          </button>
          <button type="button" onClick={onOpenFollowing} className="portfolio-toolbar__stat">
            <strong>{followingCount}</strong> Following
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onOpenFollowing} className="portfolio-toolbar__stat">
            <strong>{followingCount}</strong> Following
          </button>
          <button type="button" onClick={onOpenFollowers} className="portfolio-toolbar__stat">
            <strong>{followerCount}</strong> Followers
          </button>
        </>
      )}
    </div>
  );
}

export function PortfolioHero({
  walletAddress,
  displayUsername,
  hasStatusBadge = false,
  canEditProfile,
  onOpenProfileEditor,
  onOpenFollowing,
  onOpenFollowers,
  followingCount,
  followerCount,
  guestMode = false,
  showWalletActions = false,
}: PortfolioHeroProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const { openDeposit, openWithdraw } = useWalletFunding();

  const sharePayload = useMemo(
    () =>
      guestMode
        ? null
        : portfolioSharePayload(walletAddress, displayUsername),
    [displayUsername, guestMode, walletAddress]
  );

  return (
    <>
      <header className="portfolio-header portfolio-hero-desktop hidden md:block">
        <div className="portfolio-toolbar">
          <div className="portfolio-toolbar__shell">
            <div className="portfolio-toolbar__lead">
              <div className="portfolio-toolbar__avatar-wrap">
                {guestMode ? (
                  <div className="portfolio-toolbar__guest-avatar" aria-hidden />
                ) : canEditProfile ? (
                  <button
                    type="button"
                    onClick={onOpenProfileEditor}
                    className="portfolio-toolbar__avatar-btn"
                    aria-label="Edit profile photo and username"
                  >
                    <UserAvatarForAddress
                      address={walletAddress}
                      size="2xl"
                      framed={hasStatusBadge && !guestMode}
                      className="portfolio-toolbar__avatar shrink-0"
                    />
                    <span className="portfolio-toolbar__avatar-edit" aria-hidden>
                      <PumpIcon icon={faPen} className="portfolio-toolbar__avatar-edit-glyph" />
                    </span>
                  </button>
                ) : (
                  <UserAvatarForAddress
                    address={walletAddress}
                    size="2xl"
                    framed={hasStatusBadge && !guestMode}
                    className="portfolio-toolbar__avatar shrink-0"
                  />
                )}
              </div>

              <div className="portfolio-toolbar__meta">
                <div className="portfolio-toolbar__name-block">
                  <div className="portfolio-toolbar__name-row">
                    <div className="portfolio-toolbar__name-primary">
                      <p
                        className={
                          guestMode
                            ? "portfolio-toolbar__display-name portfolio-toolbar__display-name--guest"
                            : "portfolio-toolbar__display-name"
                        }
                      >
                        <span
                          className={`portfolio-toolbar__display-name-text${
                            !guestMode && hasStatusBadge ? " identity-name--premium" : ""
                          }`}
                        >
                          {guestMode ? "—" : displayUsername}
                        </span>
                      </p>
                      <WalletAddressChip address={walletAddress} guestMode={guestMode} />
                    </div>
                    {!guestMode ? (
                      <div className="portfolio-toolbar__name-actions portfolio-toolbar__name-actions--mobile">
                        <button
                          type="button"
                          onClick={() => setShareOpen(true)}
                          className="portfolio-toolbar__icon-btn"
                          aria-label="Share profile"
                        >
                          <PumpIcon icon={faShare} className="portfolio-toolbar__icon-btn-glyph" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <ProfileStatsRow
                    guestMode={guestMode}
                    followingCount={followingCount}
                    followerCount={followerCount}
                    onOpenFollowing={onOpenFollowing}
                    onOpenFollowers={onOpenFollowers}
                    variant="mobile"
                  />
                  <ProfileStatsRow
                    guestMode={guestMode}
                    followingCount={followingCount}
                    followerCount={followerCount}
                    onOpenFollowing={onOpenFollowing}
                    onOpenFollowers={onOpenFollowers}
                    variant="desktop"
                  />
                </div>
              </div>
            </div>

            {!guestMode ? (
              <div className="portfolio-toolbar__aside">
                {showWalletActions ? (
                  <div className="portfolio-toolbar__funding">
                    <button
                      type="button"
                      onClick={() => openDeposit()}
                      className="portfolio-toolbar__share-btn"
                    >
                      <PumpIcon icon={faDeposit} className="portfolio-toolbar__action-icon" fixedWidth />
                      <span>Deposit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openWithdraw()}
                      className="portfolio-toolbar__share-btn"
                    >
                      <PumpIcon icon={faWithdraw} className="portfolio-toolbar__action-icon" fixedWidth />
                      <span>Withdraw</span>
                    </button>
                  </div>
                ) : (
                  <div className="portfolio-toolbar__profile-actions">
                    <button
                      type="button"
                      onClick={() => setShareOpen(true)}
                      className="portfolio-toolbar__share-btn"
                    >
                      <PumpIcon icon={faShare} className="portfolio-toolbar__action-icon" />
                      <span>Share</span>
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {sharePayload ? (
        <ShareSheetModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          payload={sharePayload}
          title="Share profile"
        />
      ) : null}
    </>
  );
}
