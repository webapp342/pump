"use client";

import type { ReactNode } from "react";

type AirdropMetricsStripProps = {
  reward: ReactNode;
  progress: ReactNode;
  poolToken: ReactNode;
  status: ReactNode;
  participants?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Compact row aligned to the end — featured campaign hero card */
  variant?: "default" | "hero";
  /** Detail page mobile: reward + participants top row, progress full width below */
  compactMobile?: boolean;
  /** Detail page: status shown in hero header */
  hideStatus?: boolean;
  /** Inline hourglass + bar + pct on one row (detail page) */
  progressInline?: boolean;
};

function MetricBlock({
  label,
  children,
  className = "",
  hero = false,
  hideLabel = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hero?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <div
      className={`min-w-0 text-left ${hero ? "airdrop-metrics-strip__block--hero" : ""} ${className}`}
    >
      <p
        className={`koth-banner__tag m-0 ${hideLabel ? "invisible" : ""}`}
        aria-hidden={hideLabel}
      >
        {label}
      </p>
      <div className="airdrop-metrics-strip__value mt-1">{children}</div>
    </div>
  );
}

export function AirdropMetricsStrip({
  reward,
  progress,
  poolToken,
  status,
  participants,
  footer,
  className = "",
  variant = "default",
  compactMobile = false,
  hideStatus = false,
  progressInline = false,
}: AirdropMetricsStripProps) {
  const isHero = variant === "hero";
  const detailGridClass = [
    "airdrop-metrics-strip__detail-grid",
    compactMobile ? "airdrop-metrics-strip__detail-grid--compact" : "",
    hideStatus ? "airdrop-metrics-strip__detail-grid--no-status" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`airdrop-metrics-strip${isHero ? " airdrop-metrics-strip--hero" : ""}${
        progressInline ? " airdrop-metrics-strip--progress-inline" : ""
      } ${className}`}
    >
      <div className={isHero ? "airdrop-metrics-strip__hero-row" : detailGridClass}>
        <MetricBlock
          label="Reward pool"
          hero={isHero}
          className={
            compactMobile
              ? "airdrop-metrics-strip__block--reward"
              : undefined
          }
        >
          {reward}
        </MetricBlock>
        <MetricBlock
          label="Progress"
          hero={isHero}
          className={compactMobile ? "airdrop-metrics-strip__block--progress" : undefined}
        >
          {progress}
        </MetricBlock>
        {participants ? (
          <MetricBlock
            label="Participants"
            hero={isHero}
            className={compactMobile ? "airdrop-metrics-strip__block--participants" : undefined}
          >
            {participants}
          </MetricBlock>
        ) : null}
        <MetricBlock label="Pool token" hero={isHero} className={isHero ? "hidden" : "max-md:hidden"}>
          {poolToken}
        </MetricBlock>
        {!hideStatus ? (
          <MetricBlock label="Status" hero={isHero} className={isHero ? "hidden" : "max-md:hidden"}>
            {status}
          </MetricBlock>
        ) : null}
      </div>
      {!isHero && footer ? (
        <p className="mt-3 text-caption leading-snug text-pump-muted">{footer}</p>
      ) : null}
    </div>
  );
}
