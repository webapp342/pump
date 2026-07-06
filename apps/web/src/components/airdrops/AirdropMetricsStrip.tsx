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
  /** Featured list card — reward + progress only, full-width row */
  layout?: "featured" | "detail";
  /** Detail page: status shown in hero header */
  hideStatus?: boolean;
};

function MetricBlock({
  label,
  children,
  className = "",
  detail = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  detail?: boolean;
}) {
  return (
    <div className={`airdrop-metrics-strip__block min-w-0 ${className}`}>
      <p className={detail ? "section-label m-0" : "koth-banner__tag m-0"}>{label}</p>
      <div className="airdrop-metrics-strip__value">{children}</div>
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
  layout = "detail",
  hideStatus = false,
}: AirdropMetricsStripProps) {
  const isFeatured = layout === "featured";
  const gridClass = isFeatured
    ? "airdrop-metrics-strip__featured-grid"
    : [
        "airdrop-metrics-strip__detail-grid",
        hideStatus ? "airdrop-metrics-strip__detail-grid--no-status" : "",
        participants ? "airdrop-metrics-strip__detail-grid--with-participants" : "",
      ]
        .filter(Boolean)
        .join(" ");

  return (
    <div className={`airdrop-metrics-strip ${className}`}>
      <div className={gridClass}>
        <MetricBlock label="Reward pool" className="airdrop-metrics-strip__block--reward" detail={!isFeatured}>
          {reward}
        </MetricBlock>
        <MetricBlock label="Progress" className="airdrop-metrics-strip__block--progress" detail={!isFeatured}>
          {progress}
        </MetricBlock>
        {participants ? (
          <MetricBlock
            label="Participants"
            className="airdrop-metrics-strip__block--participants"
            detail={!isFeatured}
          >
            {participants}
          </MetricBlock>
        ) : null}
        {!isFeatured ? (
          <MetricBlock label="Pool token" className="airdrop-metrics-strip__block--pool" detail>
            {poolToken}
          </MetricBlock>
        ) : null}
        {!hideStatus && !isFeatured ? (
          <MetricBlock label="Status" className="airdrop-metrics-strip__block--status max-lg:hidden" detail>
            {status}
          </MetricBlock>
        ) : null}
      </div>
      {footer ? (
        <p className="mt-3 text-caption leading-snug text-pump-muted">{footer}</p>
      ) : null}
    </div>
  );
}
