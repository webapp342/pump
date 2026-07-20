import { NATIVE_SYMBOL } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";
import { PUMP_FEEL_DEFAULTS } from "@/config/solana";
import { bnbToUsd } from "@/lib/format-usd";
import {
  bondingSnapshotFromDbBondingState,
  computeOpenLotUnrealizedPnl,
} from "@/lib/position-exit-value";
import type { WalletLaunchpadHolding } from "@/lib/portfolio-onchain";

type PositionLike = {
  position: {
    symbol: string;
    lastPriceBnb: string | number;
    tokenAddress: string;
    logoUrl: string | null;
    reserveBnb?: string;
    tokenSold?: string;
    virtualZugReserve?: string;
    virtualTokenReserve?: string;
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

const PROTOCOL_FEE_BPS = isSolanaChainFamily
  ? BigInt(PUMP_FEEL_DEFAULTS.protocolFeeBps)
  : 100n;

function holdingOpenLotPnl(
  view: PositionLike,
  liveBnbUsd: number | null | undefined
) {
  const { position } = view;
  const snapshot =
    position.reserveBnb != null || position.tokenSold != null
      ? bondingSnapshotFromDbBondingState(
          position.reserveBnb ?? "0",
          position.tokenSold ?? "0",
          position.virtualZugReserve,
          position.virtualTokenReserve
        )
      : null;

  return computeOpenLotUnrealizedPnl(
    view.balance,
    view.remainingCostBasisUsd,
    view.remainingCostBasis,
    liveBnbUsd,
    Number(position.lastPriceBnb),
    snapshot,
    PROTOCOL_FEE_BPS
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
      const { usd: pnlUsd, pct: pnlPct } = holdingOpenLotPnl(view, bnbUsd);
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

    if (!best || (summary.valueUsd ?? 0) > (best.valueUsd ?? 0)) {
      best = summary;
    }
  }

  return best;
}
