"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconLabel } from "@/components/ui/IconLabel";

type PortfolioMetricBoxProps = {
  label: string;
  icon?: LucideIcon;
  value: ReactNode;
  valueClassName?: string;
  actions?: ReactNode;
  actionsLayout?: "single" | "split";
  actionsInlineFromMd?: boolean;
  className?: string;
};

export function PortfolioMetricBox({
  label,
  icon,
  value,
  valueClassName = "financial-value text-body-sm font-semibold text-pump-text",
  actions,
  actionsLayout = "single",
  actionsInlineFromMd = false,
  className = "",
}: PortfolioMetricBoxProps) {
  const inlineClass =
    actions && actionsInlineFromMd ? " portfolio-metric-box--inline-md" : "";

  return (
    <div className={`h-full min-w-0 ${className}`}>
      <div
        className={`portfolio-metric-box${actions ? " portfolio-metric-box--with-actions" : ""}${inlineClass}`}
      >
        {icon ? (
          <IconLabel
            icon={icon}
            hideIconMobile
            className="section-label portfolio-metric-box-label"
            iconClassName="h-3.5 w-3.5 shrink-0 opacity-75"
          >
            {label}
          </IconLabel>
        ) : (
          <span className="section-label portfolio-metric-box-label">{label}</span>
        )}

        <div className="portfolio-metric-box-body">
          <span className={valueClassName}>{value}</span>
          {actions ? (
            <div
              className={`portfolio-metric-box-actions ${
                actionsLayout === "split" ? "portfolio-metric-box-actions-split" : ""
              }`}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
