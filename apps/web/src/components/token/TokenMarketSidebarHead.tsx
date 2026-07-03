import type { TokenSidebarDensity } from "@/hooks/useTokenSidebarWidth";

export function TokenMarketSidebarHead({ density }: { density: TokenSidebarDensity }) {
  const compact = density === "compact";

  return (
    <div className="token-market-sidebar__head" aria-hidden>
      <div className="token-market-sidebar__cell token-market-sidebar__cell--name">
        <span className="token-market-sidebar__col-label">Name / Vol</span>
      </div>
      <div className="token-market-sidebar__cell token-market-sidebar__cell--mcap token-market-sidebar__col-mcap">
        <span className="token-market-sidebar__col-label">
          {compact ? "MCAP(24H)" : "MCAP"}
        </span>
      </div>
      {!compact ? (
        <div className="token-market-sidebar__cell token-market-sidebar__cell--price token-market-sidebar__col-last">
          <span className="token-market-sidebar__col-label">Last Price (24h)</span>
        </div>
      ) : null}
    </div>
  );
}
