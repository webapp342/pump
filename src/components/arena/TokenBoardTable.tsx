import Link from "next/link";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import {
  formatAge,
  formatCapForBoard,
  formatSignedPct,
  pctTone,
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
      <table className={`sheet-grid ${isArena ? "min-w-[1180px]" : "min-w-[900px]"}`}>
        <thead>
          <tr>
            {isArena ? <th /> : null}
            <th>Coin</th>
            <th>Graph</th>
            <th>MCAP</th>
            <th>ATH</th>
            <th>Age</th>
            <th>TXNS</th>
            <th>24H VOL</th>
            {isArena ? (
              <>
                <th>TRADERS</th>
                <th>1H</th>
                <th>6H</th>
                <th>24H</th>
              </>
            ) : null}
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
                {isArena ? (
                  <>
                    <td className="px-4 py-3 financial-value text-pump-text">
                      {token.traders24h ?? 0}
                    </td>
                    <td className={`px-4 py-3 financial-value ${pctTone(token.change1hPct ?? null)}`}>
                      {formatSignedPct(token.change1hPct ?? null)}
                    </td>
                    <td className={`px-4 py-3 financial-value ${pctTone(token.change6hPct ?? null)}`}>
                      {formatSignedPct(token.change6hPct ?? null)}
                    </td>
                    <td className={`px-4 py-3 financial-value ${pctTone(token.change24hPct ?? null)}`}>
                      {formatSignedPct(token.change24hPct ?? null)}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
