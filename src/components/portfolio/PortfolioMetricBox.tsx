"use client";

import type { ReactNode } from "react";

type PortfolioMetricBoxProps = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  actions?: ReactNode;
  className?: string;
};

export function PortfolioMetricBox({
  label,
  value,
  valueClassName = "financial-value text-body-sm font-semibold text-pump-text",
  actions,
  className = "",
}: PortfolioMetricBoxProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="portfolio-metric-box">
        <div className="portfolio-metric-box-main">
          <span className="section-label portfolio-metric-box-label">{label}</span>
          <span className={valueClassName}>{value}</span>
        </div>
        {actions ? <div className="portfolio-metric-box-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
