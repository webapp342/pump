"use client";

import { useEffect, useState } from "react";
import {
  DiscordBrandIcon,
  TelegramBrandIcon,
  XBrandIcon,
} from "@/components/icons/BrandIcons";
import type { TokenListItem } from "@/lib/db/launchpad";
import { HoldingSwipeRow } from "@/components/portfolio/HoldingSwipeRow";
import { TokenDetailLink } from "@/components/token/TokenDetailLink";
import { resolveLaunchpadLogoUri } from "@/lib/assets";
import { formatAge, formatArenaQuoteUsd, formatArenaVolumeUsd, formatHoldPct, isTokenAgeUnder1h } from "@/lib/arena-board-format";
import { quickTradeSwipeLabels } from "@/lib/arena-quick-trade";
import { PumpIcon, faGlobe, faLayerGroup, faUserPen, faUsers } from "@/lib/icons";
import { hasSocialLinks, type TokenSocialLinks } from "@/lib/token-social";

type FlashTone = "up" | "down";

const SOCIAL_ITEMS = [
  { key: "twitter" as const, label: "X" },
  { key: "website" as const, label: "Website" },
  { key: "telegram" as const, label: "Telegram" },
  { key: "discord" as const, label: "Discord" },
] as const;

function flashText(toneValue: FlashTone | undefined): string {
  if (toneValue === "up") return "live-metric-flash-up";
  if (toneValue === "down") return "live-metric-flash-down";
  return "";
}

type RowTone = "success" | "danger" | "neutral";

function rowToneClass(tone: RowTone): string {
  return `arena-mobile-token-row__tone--${tone}`;
}

function holderCountTone(count: number): RowTone {
  return count >= 10 ? "success" : "danger";
}

function concentrationTone(pct: number | null): RowTone {
  const value = pct ?? 0;
  return value >= 10 ? "danger" : "success";
}

function mcapValueTone(mcapUsd: number | null): "low" | "mid" | "high" {
  if (mcapUsd == null || !Number.isFinite(mcapUsd) || mcapUsd < 10_000) return "low";
  if (mcapUsd <= 20_000) return "mid";
  return "high";
}

function mcapToneClass(tone: "low" | "mid" | "high"): string {
  return `arena-mobile-token-row__mcap-tone--${tone}`;
}

function ArenaMobileSocialIcons({ links }: { links: TokenSocialLinks }) {
  if (!hasSocialLinks(links)) return null;

  return (
    <span className="arena-mobile-token-row__social">
      {SOCIAL_ITEMS.filter(({ key }) => links[key]).map(({ key, label }) => (
        <a
          key={key}
          href={links[key]}
          target="_blank"
          rel="noopener noreferrer"
          className="arena-mobile-token-row__social-btn"
          aria-label={label}
          title={label}
          onClick={(event) => event.stopPropagation()}
        >
          {key === "twitter" ? (
            <XBrandIcon className="arena-mobile-token-row__social-icon" />
          ) : key === "website" ? (
            <PumpIcon icon={faGlobe} className="arena-mobile-token-row__social-icon" />
          ) : key === "telegram" ? (
            <TelegramBrandIcon className="arena-mobile-token-row__social-icon" />
          ) : (
            <DiscordBrandIcon className="arena-mobile-token-row__social-icon" />
          )}
        </a>
      ))}
    </span>
  );
}

type ArenaMobileTokenRowProps = {
  token: TokenListItem;
  mcapUsd: number | null;
  vol24hUsd: number | null;
  mcapFlash?: FlashTone;
  onQuickTrade: (side: "buy" | "sell") => void;
};

function ArenaMobileTokenRowSurface({
  token,
  mcapUsd,
  vol24hUsd,
  mcapFlash,
}: Omit<ArenaMobileTokenRowProps, "onQuickTrade">) {
  const [imgError, setImgError] = useState(false);
  const logoSrc = token.logoUrl?.trim()
    ? resolveLaunchpadLogoUri(token.logoUrl, token.address)
    : resolveLaunchpadLogoUri(null, token.address);
  const volLabel = formatArenaVolumeUsd(vol24hUsd);
  const mcapLabel = formatArenaQuoteUsd(mcapUsd);
  const ageIsFresh = isTokenAgeUnder1h(token.createdAt);
  const holdersTone = holderCountTone(token.holderCount);
  const devTone = concentrationTone(token.creatorHoldPct);
  const top10Tone = concentrationTone(token.top10HoldPct);
  const mcapTone = mcapValueTone(mcapUsd);

  useEffect(() => {
    setImgError(false);
  }, [logoSrc]);

  return (
    <TokenDetailLink
      address={token.address}
      className="arena-mobile-token-row"
      aria-label={`View ${token.symbol}`}
    >
      <div className="arena-mobile-token-row__media">
        {logoSrc && !imgError ? (
          <img
            src={logoSrc}
            alt=""
            className="arena-mobile-token-row__image"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="arena-mobile-token-row__image arena-mobile-token-row__image--fallback">
            <span>{token.symbol.charAt(0).toUpperCase() || "?"}</span>
          </div>
        )}
      </div>

      <div className="arena-mobile-token-row__main min-w-0">
        <div className="arena-mobile-token-row__head">
          <p className="arena-mobile-token-row__name truncate">{token.name}</p>
          <div className="arena-mobile-token-row__meta-line">
            <span className="arena-mobile-token-row__symbol">{token.symbol}</span>
            <span
              className={`arena-mobile-token-row__age financial-value ${ageIsFresh ? rowToneClass("success") : ""}`}
            >
              {formatAge(token.createdAt)}
            </span>
            <ArenaMobileSocialIcons links={token.socialLinks} />
          </div>
        </div>
        <div className="arena-mobile-token-row__stats">
          <span className={`arena-mobile-token-row__stat ${rowToneClass(holdersTone)}`}>
            <PumpIcon icon={faUsers} className="arena-mobile-token-row__stat-icon" aria-hidden />
            <span className="financial-value">{token.holderCount}</span>
          </span>
          <span
            className={`arena-mobile-token-row__stat ${rowToneClass(devTone)}`}
            title={`Creator holdings ${formatHoldPct(token.creatorHoldPct)}`}
          >
            <PumpIcon icon={faUserPen} className="arena-mobile-token-row__stat-icon" aria-hidden />
            <span className="financial-value">{formatHoldPct(token.creatorHoldPct)}</span>
          </span>
          <span
            className={`arena-mobile-token-row__stat ${rowToneClass(top10Tone)}`}
            title={`Top 10 holders ${formatHoldPct(token.top10HoldPct)}`}
          >
            <PumpIcon icon={faLayerGroup} className="arena-mobile-token-row__stat-icon" aria-hidden />
            <span className="financial-value">{formatHoldPct(token.top10HoldPct)}</span>
          </span>
        </div>
      </div>

      <div className="arena-mobile-token-row__aside">
        <div className="arena-mobile-token-row__quote">
          <div className="arena-mobile-token-row__metric">
            <span className="arena-mobile-token-row__metric-label">MC</span>
            <span
              className={`arena-mobile-token-row__metric-value arena-mobile-token-row__metric-value--mc financial-value ${mcapToneClass(mcapTone)} ${flashText(mcapFlash)}`}
            >
              {mcapLabel}
            </span>
          </div>
          <div className="arena-mobile-token-row__metric">
            <span className="arena-mobile-token-row__metric-label">V</span>
            <span className="arena-mobile-token-row__metric-value arena-mobile-token-row__metric-value--vol financial-value">
              {volLabel}
            </span>
          </div>
        </div>
        <div className="arena-mobile-token-row__tx financial-value">
          <span className="arena-mobile-token-row__tx-label">TX</span>
          <span>{token.tradeCount ?? 0}</span>
        </div>
      </div>
    </TokenDetailLink>
  );
}

export function ArenaMobileTokenRow({
  token,
  mcapUsd,
  vol24hUsd,
  mcapFlash,
  onQuickTrade,
}: ArenaMobileTokenRowProps) {
  const swipeLabels = quickTradeSwipeLabels();

  return (
    <HoldingSwipeRow
      onBuyMax={() => onQuickTrade("buy")}
      onSellMax={() => onQuickTrade("sell")}
      buyLabel={swipeLabels.buyLabel}
      sellLabel={swipeLabels.sellLabel}
      rowClassName="arena-mobile-token-row__swipe"
      contentClassName="arena-mobile-token-row__surface"
    >
      <ArenaMobileTokenRowSurface
        token={token}
        mcapUsd={mcapUsd}
        vol24hUsd={vol24hUsd}
        mcapFlash={mcapFlash}
      />
    </HoldingSwipeRow>
  );
}
