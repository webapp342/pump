import { formatEther, formatUnits } from "viem";
import type { Address } from "viem";
import type { TradeItem } from "@/lib/db/launchpad";
import type { ParsedTradeEvent } from "@/lib/launchpad-events";
import { spotPriceZugFromReserves, type BondingCurveState } from "@/lib/bonding-curve";

export type OptimisticTradePreview = {
  pendingId: string;
  pendingTxHash: string;
  tradeItem: TradeItem;
  syntheticTrade: ParsedTradeEvent;
  /** Bonding-curve spot (BNB/token) immediately before/after this trade. */
  spotBeforeBnb: number;
  spotAfterBnb: number;
};

function pendingTxHashFromId(pendingId: string): string {
  return `pending:${pendingId}`;
}

/** EVM addresses are case-insensitive; Solana base58 must stay exact. */
function normalizeTraderId(trader: string): string {
  return trader.startsWith("0x") || trader.startsWith("0X")
    ? trader.toLowerCase()
    : trader;
}

function asEventAddress(trader: string): Address {
  return trader as Address;
}

export function buildOptimisticBuyPreview(params: {
  pendingId: string;
  tokenAddress: Address;
  traderAddress: string;
  submitValueWei: bigint;
  tokenOutWei: bigint;
  feeZug: bigint;
  curve: BondingCurveState;
  nativeUsdRate?: string;
}): OptimisticTradePreview {
  const netZug = params.submitValueWei - params.feeZug;
  const reserveAfter = params.curve.reserveZug + netZug;
  const soldAfter = params.curve.soldTokens + params.tokenOutWei;
  const pendingTxHash = pendingTxHashFromId(params.pendingId);
  const spotBeforeBnb = spotPriceZugFromReserves(
    params.curve.reserveZug,
    params.curve.soldTokens,
    params.curve.virtualZugReserve,
    params.curve.virtualTokenReserve
  );
  const spotAfterBnb = spotPriceZugFromReserves(
    reserveAfter,
    soldAfter,
    params.curve.virtualZugReserve,
    params.curve.virtualTokenReserve
  );

  const syntheticTrade: ParsedTradeEvent = {
    token: params.tokenAddress,
    trader: asEventAddress(params.traderAddress),
    isBuy: true,
    nativeAmount: params.submitValueWei,
    tokenAmount: params.tokenOutWei,
    feeBnb: params.feeZug,
    reserveBnb: reserveAfter,
    soldTokens: soldAfter,
  };

  const native = formatEther(params.submitValueWei);
  const fee = formatEther(params.feeZug);
  const tokens = formatUnits(params.tokenOutWei, 18);
  const price =
    params.tokenOutWei > 0n
      ? formatEther((params.submitValueWei * 10n ** 18n) / params.tokenOutWei)
      : "0";

  const tradeItem: TradeItem = {
    id: `optimistic:${pendingTxHash}`,
    side: "BUY",
    traderAddress: normalizeTraderId(params.traderAddress),
    nativeAmount: native,
    feeBnb: fee,
    netBnb: formatEther(params.submitValueWei - params.feeZug),
    tokenAmount: tokens,
    priceBnb: price,
    txHash: pendingTxHash,
    blockTime: new Date().toISOString(),
    nativeUsdRate: params.nativeUsdRate,
  };

  return {
    pendingId: params.pendingId,
    pendingTxHash,
    tradeItem,
    syntheticTrade,
    spotBeforeBnb,
    spotAfterBnb,
  };
}

export function buildOptimisticSellPreview(params: {
  pendingId: string;
  tokenAddress: Address;
  traderAddress: string;
  sellTokenWei: bigint;
  zugOutWei: bigint;
  feeZug: bigint;
  curve: BondingCurveState;
  nativeUsdRate?: string;
}): OptimisticTradePreview {
  const grossZug = params.zugOutWei + params.feeZug;
  const reserveAfter =
    params.curve.reserveZug > grossZug
      ? params.curve.reserveZug - grossZug
      : 0n;
  const soldAfter =
    params.curve.soldTokens > params.sellTokenWei
      ? params.curve.soldTokens - params.sellTokenWei
      : 0n;
  const pendingTxHash = pendingTxHashFromId(params.pendingId);
  const spotBeforeBnb = spotPriceZugFromReserves(
    params.curve.reserveZug,
    params.curve.soldTokens,
    params.curve.virtualZugReserve,
    params.curve.virtualTokenReserve
  );
  const spotAfterBnb = spotPriceZugFromReserves(
    reserveAfter,
    soldAfter,
    params.curve.virtualZugReserve,
    params.curve.virtualTokenReserve
  );

  const syntheticTrade: ParsedTradeEvent = {
    token: params.tokenAddress,
    trader: asEventAddress(params.traderAddress),
    isBuy: false,
    nativeAmount: grossZug,
    tokenAmount: params.sellTokenWei,
    feeBnb: params.feeZug,
    reserveBnb: reserveAfter,
    soldTokens: soldAfter,
  };

  const native = formatEther(grossZug);
  const fee = formatEther(params.feeZug);
  const tokens = formatUnits(params.sellTokenWei, 18);
  const price =
    params.sellTokenWei > 0n
      ? formatEther((grossZug * 10n ** 18n) / params.sellTokenWei)
      : "0";

  const tradeItem: TradeItem = {
    id: `optimistic:${pendingTxHash}`,
    side: "SELL",
    traderAddress: normalizeTraderId(params.traderAddress),
    nativeAmount: native,
    feeBnb: fee,
    netBnb: formatEther(params.zugOutWei),
    tokenAmount: tokens,
    priceBnb: price,
    txHash: pendingTxHash,
    blockTime: new Date().toISOString(),
    nativeUsdRate: params.nativeUsdRate,
  };

  return {
    pendingId: params.pendingId,
    pendingTxHash,
    tradeItem,
    syntheticTrade,
    spotBeforeBnb,
    spotAfterBnb,
  };
}
