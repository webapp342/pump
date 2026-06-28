"use client";

import type { CSSProperties } from "react";
import { PumpIcon, faChevronLeft, faChevronRight } from "@/lib/icons";

type TokenSidebarCollapseToggleProps = {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
  style?: CSSProperties;
};

export function TokenSidebarCollapseToggle({
  expanded,
  onToggle,
  className,
  style,
}: TokenSidebarCollapseToggleProps) {
  return (
    <button
      type="button"
      className={["token-sidebar-collapse-toggle", className].filter(Boolean).join(" ")}
      style={style}
      onClick={onToggle}
      aria-label={expanded ? "Collapse market list" : "Expand market list"}
      aria-expanded={expanded}
      aria-controls="token-market-sidebar"
    >
      <PumpIcon
        icon={expanded ? faChevronLeft : faChevronRight}
        className="h-3 w-3 shrink-0"
        aria-hidden
      />
    </button>
  );
}
