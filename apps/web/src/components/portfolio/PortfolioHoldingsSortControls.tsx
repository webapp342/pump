"use client";

import type {
  PortfolioHoldingsSortDir,
  PortfolioHoldingsSortKey,
} from "@/lib/portfolio-holdings-sort";

type PortfolioHoldingsColumnSortProps = {
  label: string;
  column: PortfolioHoldingsSortKey;
  sortKey: PortfolioHoldingsSortKey;
  sortDir: PortfolioHoldingsSortDir;
  onSort: (column: PortfolioHoldingsSortKey) => void;
  align?: "start" | "end";
  className?: string;
};

export function PortfolioHoldingsColumnSort({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  align = "start",
  className = "",
}: PortfolioHoldingsColumnSortProps) {
  const active = sortKey === column;

  return (
    <button
      type="button"
      className={`portfolio-holdings-sort portfolio-holdings-sort--${align}${
        active ? " portfolio-holdings-sort--active" : ""
      } ${className}`.trim()}
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}${active ? `, ${sortDir === "asc" ? "low to high" : "high to low"}` : ""}`}
    >
      <span className="portfolio-holdings-sort__label">{label}</span>
      <span className="portfolio-holdings-sort__icons" aria-hidden>
        <span
          className={`portfolio-holdings-sort__arrow portfolio-holdings-sort__arrow--up${
            active && sortDir === "asc" ? " portfolio-holdings-sort__arrow--active" : ""
          }`}
        />
        <span
          className={`portfolio-holdings-sort__arrow portfolio-holdings-sort__arrow--down${
            active && sortDir === "desc" ? " portfolio-holdings-sort__arrow--active" : ""
          }`}
        />
      </span>
    </button>
  );
}

type PortfolioHoldingsMobileHeaderProps = {
  sortKey: PortfolioHoldingsSortKey;
  sortDir: PortfolioHoldingsSortDir;
  onSort: (column: PortfolioHoldingsSortKey) => void;
  valueLabel?: string;
};

export function PortfolioHoldingsMobileHeader({
  sortKey,
  sortDir,
  onSort,
  valueLabel = "Value/PNL",
}: PortfolioHoldingsMobileHeaderProps) {
  return (
    <div className="portfolio-holdings-mobile__header">
      <span className="portfolio-holdings-mobile__coin-col">Coin</span>
      <PortfolioHoldingsColumnSort
        label="Amount"
        column="amount"
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        className="portfolio-holdings-mobile__amount-col"
      />
      <PortfolioHoldingsColumnSort
        label={valueLabel}
        column="value"
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        align="end"
        className="portfolio-holdings-mobile__value-col"
      />
    </div>
  );
}

type PortfolioHoldingsGridHeadProps = {
  sortKey: PortfolioHoldingsSortKey;
  sortDir: PortfolioHoldingsSortDir;
  onSort: (column: PortfolioHoldingsSortKey) => void;
};

export function PortfolioHoldingsGridHead({
  sortKey,
  sortDir,
  onSort,
}: PortfolioHoldingsGridHeadProps) {
  return (
    <tr>
      <th>Coin</th>
      <th className="portfolio-holdings-grid__actions-head" aria-label="Actions" />
      <th className="portfolio-holdings-grid__num">
        <PortfolioHoldingsColumnSort
          label="Amount"
          column="amount"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          align="end"
        />
      </th>
      <th className="portfolio-holdings-grid__num">
        <PortfolioHoldingsColumnSort
          label="Value"
          column="value"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          align="end"
        />
      </th>
      <th className="portfolio-holdings-grid__num">Entry</th>
      <th className="portfolio-holdings-grid__num">P/L</th>
    </tr>
  );
}
