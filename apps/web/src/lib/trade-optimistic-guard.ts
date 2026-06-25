import { parseGwei } from "viem";
import type { Address, PublicClient } from "viem";
import { bufferedGasCostWei } from "@/lib/aa/gas-buffer";
import { assertScwReadyForUserOp } from "@/lib/aa/scw-preflight";
import {
  quoteBuyFromCurveState,
  quoteSellFromCurveState,
  type BondingCurveState,
} from "@/lib/bonding-curve";

/** Extra gas headroom on top of buffered estimate — stale gasPrice / AA simulate slack. */
export const INSTANT_TRADE_GAS_HEADROOM_BPS = 2_000n; // +20%

const SCW_MIN_GAS_UNITS = 200_000n;
const MIN_GAS_PRICE_WEI = parseGwei("0.1");

export type InstantTradeGateInput = {
  side: "buy" | "sell";
  paused: boolean;
  wrongChain: boolean;
  balancePending: boolean;
  gasLoading: boolean;
  needsLegacyApproval: boolean;
  sellUsesPermit: boolean;
  allowanceSufficient: boolean;
  bondingCurve?: BondingCurveState;
  protocolFeeBps?: bigint;
  buyCostWei: bigint;
  sellTokenWei: bigint;
  bnbBalance?: bigint;
  tokenBalance?: bigint;
  buyGasReserveWei: bigint;
  sellGasReserveWei: bigint;
  /** Extra gas when sell requires a separate ERC20 approve tx (SCW path). */
  legacyApproveGasReserveWei?: bigint;
  maxBuySpendWei: bigint;
  gasPriceWei?: bigint;
};

export type InstantTradeGateBuy = {
  ok: true;
  side: "buy";
  submitValue: bigint;
  tokenOut: bigint;
  feeZug: bigint;
};

export type InstantTradeGateSell = {
  ok: true;
  side: "sell";
  sellTokenWei: bigint;
  zugOut: bigint;
  feeZug: bigint;
};

export type InstantTradeGateFail = {
  ok: false;
  reason: string;
};

export type InstantTradeGateResult =
  | InstantTradeGateBuy
  | InstantTradeGateSell
  | InstantTradeGateFail;

function gasReserveWithHeadroom(reserveWei: bigint): bigint {
  if (reserveWei <= 0n) return 0n;
  return (reserveWei * (10_000n + INSTANT_TRADE_GAS_HEADROOM_BPS)) / 10_000n;
}

function scwGasFloor(gasPriceWei?: bigint): bigint {
  const price =
    gasPriceWei != null && gasPriceWei > 0n ? gasPriceWei : MIN_GAS_PRICE_WEI;
  return bufferedGasCostWei(SCW_MIN_GAS_UNITS, price);
}

function conservativeGasReserve(
  side: "buy" | "sell",
  input: InstantTradeGateInput
): bigint {
  const panelReserve =
    side === "buy" ? input.buyGasReserveWei : input.sellGasReserveWei;
  const legacyApprove =
    side === "sell" && input.needsLegacyApproval
      ? (input.legacyApproveGasReserveWei ?? 0n)
      : 0n;
  const floor = scwGasFloor(input.gasPriceWei);
  const base = panelReserve + legacyApprove > floor ? panelReserve + legacyApprove : floor;
  return gasReserveWithHeadroom(base);
}

/**
 * Synchronous gate — only returns ok when cached balances + gas math pass with headroom.
 * Used for 0ms optimistic UI; must pair with `hardValidateInstantTrade` before send.
 */
export function evaluateInstantTradeGate(
  input: InstantTradeGateInput
): InstantTradeGateResult {
  if (input.wrongChain) return { ok: false, reason: "wrong_chain" };
  if (input.paused) return { ok: false, reason: "paused" };
  if (input.balancePending) return { ok: false, reason: "balance_pending" };
  if (input.gasLoading) return { ok: false, reason: "gas_loading" };
  if (input.bnbBalance === undefined) return { ok: false, reason: "bnb_unknown" };
  if (!input.bondingCurve || input.protocolFeeBps === undefined) {
    return { ok: false, reason: "curve_unavailable" };
  }

  const gasReserve = conservativeGasReserve(input.side, input);
  if (gasReserve <= 0n) return { ok: false, reason: "gas_reserve_unknown" };

  if (input.side === "buy") {
    if (input.buyCostWei <= 0n) return { ok: false, reason: "zero_amount" };
    const submitValue =
      input.buyCostWei > input.maxBuySpendWei ? input.maxBuySpendWei : input.buyCostWei;
    if (submitValue <= 0n) return { ok: false, reason: "insufficient_bnb" };
    if (submitValue + gasReserve > input.bnbBalance) {
      return { ok: false, reason: "insufficient_bnb_gas" };
    }

    const { tokenOut, feeZug } = quoteBuyFromCurveState(
      input.bondingCurve,
      input.protocolFeeBps,
      submitValue
    );
    if (tokenOut <= 0n) return { ok: false, reason: "quote_zero" };

    return { ok: true, side: "buy", submitValue, tokenOut, feeZug };
  }

  if (input.sellTokenWei <= 0n) return { ok: false, reason: "zero_amount" };
  if (input.tokenBalance === undefined) return { ok: false, reason: "token_unknown" };
  if (input.sellTokenWei > input.tokenBalance) {
    return { ok: false, reason: "insufficient_token" };
  }
  if (input.bnbBalance < gasReserve) {
    return { ok: false, reason: "insufficient_gas" };
  }

  if (input.needsLegacyApproval) {
    // SCW cannot EIP-2612 permit — approve + sell; gas reserve includes both txs.
  } else if (input.sellUsesPermit) {
    // Permit signs in background — allowance not required on-chain yet.
  } else if (!input.allowanceSufficient) {
    return { ok: false, reason: "allowance" };
  }

  const { ethOut, feeZug } = quoteSellFromCurveState(
    input.bondingCurve,
    input.protocolFeeBps,
    input.sellTokenWei
  );
  if (ethOut <= 0n) return { ok: false, reason: "quote_zero" };

  return {
    ok: true,
    side: "sell",
    sellTokenWei: input.sellTokenWei,
    zugOut: ethOut,
    feeZug,
  };
}

export type HardValidateInstantTradeInput = {
  scwAddress: Address;
  side: "buy" | "sell";
  callValueWei: bigint;
  bnbBalanceWei: bigint;
  tokenBalanceWei?: bigint;
  sellTokenWei?: bigint;
  gasReserveWei: bigint;
  publicClient?: PublicClient;
};

/** Async re-check immediately before UserOp submit (after optimistic UI). */
export async function hardValidateInstantTrade(
  input: HardValidateInstantTradeInput
): Promise<void> {
  const gasReserve = gasReserveWithHeadroom(
    input.gasReserveWei > scwGasFloor()
      ? input.gasReserveWei
      : scwGasFloor()
  );

  if (input.side === "buy") {
    if (input.callValueWei + gasReserve > input.bnbBalanceWei) {
      throw new Error("Insufficient BNB for trade and gas.");
    }
  } else {
    const sellWei = input.sellTokenWei ?? 0n;
    if (sellWei <= 0n) throw new Error("Enter a valid amount.");
    if (input.tokenBalanceWei !== undefined && sellWei > input.tokenBalanceWei) {
      throw new Error("Insufficient token balance.");
    }
    if (input.bnbBalanceWei < gasReserve) {
      throw new Error("Insufficient BNB for network fees.");
    }
  }

  await assertScwReadyForUserOp(
    input.scwAddress,
    input.side === "buy" ? input.callValueWei : 0n,
    input.publicClient
  );
}

export function createOptimisticPendingId(): string {
  return `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
