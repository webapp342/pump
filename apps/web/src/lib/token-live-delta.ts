import {
  BONDING_TOKEN_SUPPLY_HUMAN,
} from "@/lib/bonding-curve";
import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import type { CandleWsUpdate } from "@/lib/candles";
import { arenaWsSpotPriceBnb, bondingMarkCapBnbFromWs, type ArenaTradeWsPayload } from "@/lib/arena-live-delta";

export type TokenTradeWsPayload = {
  type?: string;
  tokenAddress?: string;
  candleUpdates?: CandleWsUpdate[];
  trade?: {
    id: string;
    side: string;
    traderAddress: string;
    zugAmount: string;
    feeZug?: string;
    tokenAmount: string;
    priceZug: string;
    txHash: string;
    logIndex?: number;
    blockTime: string;
    nativeUsdRate?: string;
  };
  bonding?: ArenaTradeWsPayload["bonding"];
};

function tradeKey(trade: Pick<TradeItem, "txHash" | "id">): string {
  return `${trade.txHash.toLowerCase()}:${trade.id}`;
}

/** Fill price from gross BNB / tokens (tape semantics; not WS mark price). */
function fillPriceBnbFromWsTrade(trade: NonNullable<TokenTradeWsPayload["trade"]>): string {
  const gross = Number(trade.zugAmount);
  const tokens = Number(trade.tokenAmount);
  if (Number.isFinite(gross) && Number.isFinite(tokens) && tokens > 0) {
    return String(gross / tokens);
  }
  const mark = Number(trade.priceZug);
  return Number.isFinite(mark) && mark > 0 ? String(mark) : "0";
}

export function wsPayloadToTradeItem(payload: TokenTradeWsPayload): TradeItem | null {
  const trade = payload.trade;
  if (!trade?.txHash || !trade.blockTime) return null;

  const gross = Number(trade.zugAmount);
  const fee = trade.feeZug != null ? Number(trade.feeZug) : 0;
  const net = Math.max(0, gross - fee);

  return {
    id: trade.id || `${trade.txHash}:${trade.logIndex ?? 0}`,
    side: trade.side,
    traderAddress: trade.traderAddress.toLowerCase(),
    nativeAmount: trade.zugAmount,
    feeBnb: trade.feeZug,
    netBnb: String(net),
    tokenAmount: trade.tokenAmount,
    priceBnb: fillPriceBnbFromWsTrade(trade),
    txHash: trade.txHash.toLowerCase(),
    blockTime: trade.blockTime,
    nativeUsdRate: trade.nativeUsdRate,
  };
}

export function prependTradeIfNew(trades: TradeItem[], incoming: TradeItem): TradeItem[] {
  const key = tradeKey(incoming);
  if (trades.some((t) => tradeKey(t) === key)) return trades;
  return [incoming, ...trades];
}

export function patchTokenDetailFromWsTrade(
  token: TokenDetail,
  payload: TokenTradeWsPayload
): TokenDetail | null {
  const addr = payload.tokenAddress?.toLowerCase();
  if (!addr || token.address.toLowerCase() !== addr) return null;

  const bonding = payload.bonding;
  const mcapBnb = bonding
    ? bondingMarkCapBnbFromWs(bonding, token.marketCapBnb) ?? token.marketCapBnb
    : token.marketCapBnb;
  const spotPublished = bonding
    ? Number(bonding.spotPriceZug ?? bonding.lastPriceZug)
    : 0;
  const spotFromMcap =
    Number(mcapBnb) > 0 ? Number(mcapBnb) / BONDING_TOKEN_SUPPLY_HUMAN : 0;
  const spot =
    spotPublished > 0
      ? spotPublished
      : spotFromMcap > 0
        ? spotFromMcap
        : bonding
          ? arenaWsSpotPriceBnb(bonding)
          : 0;
  const spotStr = spot > 0 ? String(spot) : token.lastPriceBnb;

  return {
    ...token,
    reserveBnb: bonding?.reserveZug ?? token.reserveBnb,
    tokenSold: bonding?.tokenSold ?? token.tokenSold,
    progressBps: bonding?.progressBps ?? token.progressBps,
    tradeCount: bonding?.tradeCount ?? token.tradeCount,
    holderCount: bonding?.holderCount ?? token.holderCount,
    lastPriceBnb: spotStr,
    marketCapBnb: mcapBnb,
  };
}

/** Spot from bonding WS — prefer indexer fields over default-virtual reserve replay. */
export function wsBondingSpotPriceBnb(
  bonding: { reserveZug?: string; tokenSold?: string; lastPriceZug?: string; marketCapZug?: string; spotPriceZug?: string } | undefined
): number {
  if (!bonding) return 0;
  const spotPublished = Number(bonding.spotPriceZug ?? bonding.lastPriceZug);
  if (Number.isFinite(spotPublished) && spotPublished > 0) return spotPublished;
  const mcap = Number(bonding.marketCapZug);
  if (Number.isFinite(mcap) && mcap > 0) return mcap / BONDING_TOKEN_SUPPLY_HUMAN;
  return arenaWsSpotPriceBnb(bonding);
}

export function mergeChartTradePatch(trades: TradeItem[], incoming: TradeItem): TradeItem[] {
  const key = tradeKey(incoming);
  const existing = trades.find((t) => tradeKey(t) === key);
  if (existing) return trades;
  return [...trades, incoming].sort(
    (a, b) => new Date(a.blockTime).getTime() - new Date(b.blockTime).getTime()
  );
}
