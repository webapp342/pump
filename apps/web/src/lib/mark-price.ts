import { resolveLatestSpotPriceBnb } from "@/lib/candles";
import {
  displayTokenPriceBnb,
  spotPriceBnbFromBondingDecimals,
  spotPriceBnbFromCurveTuple,
} from "@/lib/bonding-curve";
import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import type { CurveTuple } from "@/lib/launchpad-events";

/**
 * Single native mark price for chart, header, holders P/L, portfolio.
 * Priority: trade-replay spot → on-chain curve → DB bonding reserves → stored last price.
 * USD display = native × nativeUsd (oracle); never mix USD into OHLC storage.
 */
export function resolveMarkPriceBnb(
  token: Pick<TokenDetail, "lastPriceBnb" | "tradeCount" | "reserveBnb" | "tokenSold">,
  liveTrades: TradeItem[],
  chainCurve?: CurveTuple
): number {
  const fromReplay = resolveLatestSpotPriceBnb(liveTrades);
  if (fromReplay != null && fromReplay > 0) return fromReplay;

  if (chainCurve) {
    const fromChain = spotPriceBnbFromCurveTuple(
      chainCurve[2],
      chainCurve[3],
      chainCurve[5],
      chainCurve[6]
    );
    if (fromChain > 0) return fromChain;
  }

  const fromBonding = spotPriceBnbFromBondingDecimals(token.reserveBnb, token.tokenSold);
  if (fromBonding > 0) return fromBonding;

  const fromDb = Number(token.lastPriceBnb);
  if (fromDb > 0) return fromDb;

  return displayTokenPriceBnb(token.lastPriceBnb, token.tradeCount);
}
