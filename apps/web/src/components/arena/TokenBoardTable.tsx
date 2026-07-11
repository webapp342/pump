import Link from "next/link";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { TableHeaderLabel } from "@/components/ui/IconLabel";
import { MetricIcons } from "@/lib/metric-icons";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import { PctChange } from "@/components/ui/PctChange";
import {
  formatAge,
  formatCapForBoard,
} from "@/lib/arena-board-format";

function TrendSparkline({
  points,
  positive,
}: {
  points: number[];
  positive: boolean;
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1e-9);
  const poly = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * 56;
      const y = 18 - ((p - min) / range) * 16;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 56 20" aria-hidden className="h-5 w-14">
      <polyline
        points={poly}
        fill="none"
        stroke={positive ? "rgb(56 197 129)" : "rgb(227 95 95)"}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

type TokenBoardTableProps = {
  tokens: TokenListItem[];
  bnbUsd: number | null;
  variant?: "arena" | "created";
};

export function TokenBoardTable({
  tokens,
  bnbUsd,
  variant = "created",
}: TokenBoardTableProps) {
  const isArena = variant === "arena";

  return (
    <div className="overflow-x-auto">
      <table className={`sheet-grid ${isArena ? "min-w-[1180px]" : "min-w-[520px]"}`}>
        <thead>
          <tr>
            {isArena ? <th /> : null}
            <th>Coin</th>
            {isArena ? (
              <>
                <th><TableHeaderLabel icon={MetricIcons.graph}>Graph</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.mcap}>MCAP</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.ath}>ATH</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.age}>Age</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.txns}>TXNS</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.vol24h}>24H VOL</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.traders}>TRADERS</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.change1h}>1H</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.change6h}>6H</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.change24h}>24H</TableHeaderLabel></th>
              </>
            ) : (
              <>
                <th><TableHeaderLabel icon={MetricIcons.mcap}>MCAP</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.change24h}>24H</TableHeaderLabel></th>
                <th><TableHeaderLabel icon={MetricIcons.age}>Age</TableHeaderLabel></th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, index) => {
            const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd);
            const athMcapUsd = bnbToUsd(
              Number(token.athMarketCapBnb ?? token.marketCapBnb),
              bnbUsd
            );
            const vol24hUsd = bnbToUsd(Number(token.volume24hBnb ?? 0), bnbUsd);
            const trendPoints = [
              token.change24hPct ?? 0,
              token.change6hPct ?? 0,
              token.change1hPct ?? 0,
              0,
            ];
            const trendPositive = (token.change24hPct ?? 0) >= 0;

            return (
              <tr key={token.address}>
                {isArena ? <td className="px-2 py-3" /> : null}
                <td className="px-4 py-3">
                  <Link href={`/token/${token.address}`} className="flex min-w-0 items-center gap-3">
                    {isArena ? (
                      <span className="financial-value w-4 text-caption text-pump-muted">
                        {index + 1}
                      </span>
                    ) : null}
                    <TokenAvatar
                      address={token.address}
                      symbol={token.symbol}
                      logoUrl={token.logoUrl}
                      size={30}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium text-pump-text">
                        {token.name}
                      </p>
                      <p className="truncate text-caption text-pump-muted">${token.symbol}</p>
                    </div>
                  </Link>
                </td>
                {isArena ? (
                  <>
                    <td className="px-4 py-3">
                      <TrendSparkline points={trendPoints} positive={trendPositive} />
                    </td>
                    <td className="px-4 py-3 financial-value font-semibold text-pump-text">
                      {formatCapForBoard(mcapUsd)}
                    </td>
                    <td className="px-4 py-3 financial-value text-pump-text">
                      {formatCapForBoard(athMcapUsd)}
                    </td>
                    <td className="px-4 py-3 text-pump-text">{formatAge(token.createdAt)}</td>
                    <td className="px-4 py-3 financial-value text-pump-text">
                      {token.tradeCount ?? 0}
                    </td>
                    <td className="px-4 py-3 financial-value text-pump-text">
                      {formatUsdReadable(vol24hUsd, { compact: true })}
                    </td>
                    <td className="px-4 py-3 financial-value text-pump-text">
                      {token.traders24h ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <PctChange value={token.change1hPct ?? null} />
                    </td>
                    <td className="px-4 py-3">
                      <PctChange value={token.change6hPct ?? null} />
                    </td>
                    <td className="px-4 py-3">
                      <PctChange value={token.change24hPct ?? null} />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 financial-value font-semibold text-pump-text">
                      {formatCapForBoard(mcapUsd)}
                    </td>
                    <td className="px-4 py-3">
                      <PctChange value={token.change24hPct ?? null} />
                    </td>
                    <td className="px-4 py-3 text-pump-text">{formatAge(token.createdAt)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
