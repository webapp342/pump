import { formatEther, formatUnits, parseEventLogs, type Address, type TransactionReceipt } from "viem";
import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import {
  bondingCurveManagerAbi,
  spotPriceZugFromReserves,
} from "@/lib/bonding-curve";

export type ParsedTradeEvent = {
  token: Address;
  trader: Address;
  isBuy: boolean;
  nativeAmount: bigint;
  tokenAmount: bigint;
  feeBnb: bigint;
  reserveBnb: bigint;
  soldTokens: bigint;
};

export function parseTradesFromReceipt(
  receipt: TransactionReceipt,
  expectedToken?: Address
): ParsedTradeEvent[] {
  const events = parseEventLogs({
    abi: bondingCurveManagerAbi,
    logs: receipt.logs,
    eventName: "Trade",
  });

  return events
    .map((event) => ({
      token: event.args.token as Address,
      trader: event.args.trader as Address,
      isBuy: Boolean(event.args.isBuy),
      nativeAmount: event.args.ethAmount as bigint,
      tokenAmount: event.args.tokenAmount as bigint,
      feeBnb: event.args.feeEth as bigint,
      reserveBnb: event.args.reserveEth as bigint,
      soldTokens: event.args.soldTokens as bigint,
    }))
    .filter(
      (trade) =>
        !expectedToken || trade.token.toLowerCase() === expectedToken.toLowerCase()
    );
}

export function blockTimeIsoFromUnixSeconds(timestampSec: bigint | number): string {
  return new Date(Number(timestampSec) * 1000).toISOString();
}

export function tradeEventToItem(
  trade: ParsedTradeEvent,
  txHash: string,
  logIndex = 0,
  blockTimeIso?: string,
  nativeUsdRate?: string
): TradeItem {
  const native = formatEther(trade.nativeAmount);
  const fee = formatEther(trade.feeBnb);
  const net = formatEther(trade.nativeAmount - trade.feeBnb);
  const tokens = formatUnits(trade.tokenAmount, 18);
  const price =
    trade.tokenAmount > 0n
      ? formatEther((trade.nativeAmount * 10n ** 18n) / trade.tokenAmount)
      : "0";

  return {
    id: `optimistic:${txHash.toLowerCase()}:${logIndex}`,
    side: trade.isBuy ? "BUY" : "SELL",
    traderAddress: trade.trader.toLowerCase(),
    nativeAmount: native,
    feeBnb: fee,
    netBnb: net,
    tokenAmount: tokens,
    priceBnb: price,
    txHash: txHash.toLowerCase(),
    blockTime: blockTimeIso ?? new Date().toISOString(),
    nativeUsdRate,
  };
}

export function resolveTradeItemsFromReceipt(
  receipt: TransactionReceipt,
  txHash: string,
  expectedToken?: Address,
  blockTimeIso?: string,
  nativeUsdRate?: string
): { items: TradeItem[]; parsed: ParsedTradeEvent[] } {
  const parsed = parseTradesFromReceipt(receipt, expectedToken);
  const items = parsed.map((trade, index) =>
    tradeEventToItem(trade, txHash, index, blockTimeIso, nativeUsdRate)
  );
  return { items, parsed };
}

export function applyTradeToToken(token: TokenDetail, trade: ParsedTradeEvent): TokenDetail {
  // Solana pump-feel synthetics stash virtual pool SOL in reserveBnb and a single-fill
  // token amount in soldTokens — must not feed EVM-style spot math (creates false MCAP spikes).
  const pumpFeelSynthetic =
    trade.soldTokens === trade.tokenAmount && trade.tokenAmount > 0n;

  const spotAfter = pumpFeelSynthetic
    ? 0
    : spotPriceZugFromReserves(trade.reserveBnb, trade.soldTokens);
  const price =
    spotAfter > 0
      ? String(spotAfter)
      : trade.tokenAmount > 0n
        ? formatEther((trade.nativeAmount * 10n ** 18n) / trade.tokenAmount)
        : token.lastPriceBnb;

  if (pumpFeelSynthetic) {
    return {
      ...token,
      lastPriceBnb: price,
      tradeCount: token.tradeCount + 1,
      status: token.status === "PAUSED" ? "PAUSED" : "BONDING",
    };
  }

  return {
    ...token,
    reserveBnb: formatEther(trade.reserveBnb),
    lastPriceBnb: price,
    tradeCount: token.tradeCount + 1,
    status: token.status === "PAUSED" ? "PAUSED" : "BONDING",
  };
}

export type CurveTuple = readonly [
  Address,
  Address,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
];

export function tokenFromCurve(token: TokenDetail, curve: CurveTuple): TokenDetail {
  return {
    ...token,
    reserveBnb: formatEther(curve[2]),
    targetBnb: formatEther(curve[4]),
    status: curve[7] ? "PAUSED" : "BONDING",
  };
}
