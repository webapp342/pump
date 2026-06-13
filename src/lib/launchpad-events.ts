import { formatEther, formatUnits, parseEventLogs, type Address, type TransactionReceipt } from "viem";
import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";

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
      nativeAmount: event.args.zugAmount as bigint,
      tokenAmount: event.args.tokenAmount as bigint,
      feeBnb: event.args.feeZug as bigint,
      reserveBnb: event.args.reserveZug as bigint,
      soldTokens: event.args.soldTokens as bigint,
    }))
    .filter(
      (trade) =>
        !expectedToken || trade.token.toLowerCase() === expectedToken.toLowerCase()
    );
}

export function tradeEventToItem(
  trade: ParsedTradeEvent,
  txHash: string,
  logIndex = 0
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
    blockTime: new Date().toISOString(),
  };
}

export function applyTradeToToken(token: TokenDetail, trade: ParsedTradeEvent): TokenDetail {
  const price =
    trade.tokenAmount > 0n
      ? formatEther((trade.nativeAmount * 10n ** 18n) / trade.tokenAmount)
      : token.lastPriceBnb;

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
