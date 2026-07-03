import { NATIVE_SYMBOL } from "@/config/chain";
import {
  bnbToUsd,
  positionUnrealizedPct,
  positionUnrealizedUsd,
} from "@/lib/format-usd";
import type { WalletLaunchpadHolding } from "@/lib/portfolio-onchain";

type PositionLike = {
  position: {
    symbol: string;
    lastPriceBnb: string | number;
    tokenAddress: string;
    logoUrl: string | null;
  };
  balance: number;
  remainingCostBasisUsd: number;
  remainingCostBasis: number;
};

export type PortfolioHoldingRow =
  | { kind: "position"; view: PositionLike; estimatedValueBnb: number }
  | { kind: "wallet"; holding: WalletLaunchpadHolding; estimatedValueBnb: number };

export type TopHoldingSummary = {
  symbol: string;
  tokenAddress: string | null;
  logoUrl: string | null;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  isNative: boolean;
};

function holdingOpenPnlUsd(
  view: PositionLike,
  liveBnbUsd: number | null | undefined
): number | null {
  return positionUnrealizedUsd(
    view.balance,
    Number(view.position.lastPriceBnb),
    view.remainingCostBasisUsd,
    view.remainingCostBasis,
    liveBnbUsd
  );
}

export function resolveTopHoldingSummary(
  rows: PortfolioHoldingRow[],
  nativeBnb: number,
  bnbUsd: number | null | undefined
): TopHoldingSummary | null {
  const nativeUsd = bnbToUsd(nativeBnb, bnbUsd);
  let best: TopHoldingSummary | null =
    nativeBnb > 0 && nativeUsd != null
      ? {
          symbol: NATIVE_SYMBOL,
          tokenAddress: null,
          logoUrl: null,
          valueUsd: nativeUsd,
          pnlUsd: null,
          pnlPct: null,
          isNative: true,
        }
      : null;

  for (const row of rows) {
    const valueUsd = bnbToUsd(row.estimatedValueBnb, bnbUsd);
    if (valueUsd == null) continue;

    let summary: TopHoldingSummary;
    if (row.kind === "position") {
      const { view } = row;
      const pnlUsd = holdingOpenPnlUsd(view, bnbUsd);
      const pnlPct = positionUnrealizedPct(
        pnlUsd,
        view.remainingCostBasisUsd,
        view.remainingCostBasis,
        bnbUsd
      );
      summary = {
        symbol: row.view.position.symbol,
        tokenAddress: row.view.position.tokenAddress,
        logoUrl: row.view.position.logoUrl,
        valueUsd,
        pnlUsd,
        pnlPct,
        isNative: false,
      };
    } else {
      summary = {
        symbol: row.holding.symbol,
        tokenAddress: row.holding.tokenAddress,
        logoUrl: row.holding.logoUrl,
        valueUsd,
        pnlUsd: null,
        pnlPct: null,
        isNative: false,
      };
    }

    if (!best || (best.valueUsd ?? 0) < valueUsd) {
      best = summary;
    }
  }

  return best;
}
