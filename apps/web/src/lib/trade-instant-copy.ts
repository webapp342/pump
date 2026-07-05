import { NATIVE_SYMBOL } from "@/config/chain";

/** Transient states — skip trade silently (no error toast spam during rapid-fire). */
export function isTransientInstantGateReason(reason: string): boolean {
  return (
    reason === "gas_loading" ||
    reason === "balance_pending" ||
    reason === "bnb_unknown" ||
    reason === "token_unknown" ||
    reason === "gas_reserve_unknown"
  );
}

/** Mobile dock quick trade — open sheet only when funding blocks the trade. */
export function isQuickSubmitFundingBlock(reason: string): boolean {
  return (
    reason === "insufficient_bnb" ||
    reason === "insufficient_bnb_gas" ||
    reason === "insufficient_token" ||
    reason === "insufficient_gas"
  );
}

export function instantTradeGateMessage(reason: string): string {
  switch (reason) {
    case "zero_amount":
      return "Enter a valid amount.";
    case "wrong_chain":
      return "Switch to the correct network.";
    case "paused":
      return "Trading is paused for this token.";
    case "balance_pending":
      return "Loading wallet balance…";
    case "gas_loading":
      return "Estimating network fees…";
    case "curve_unavailable":
      return "Could not quote this trade.";
    case "quote_zero":
      return "Trade amount too small after fees.";
    case "insufficient_bnb":
    case "insufficient_bnb_gas":
      return `Not enough ${NATIVE_SYMBOL} available for this buy.`;
    case "insufficient_token":
      return "Insufficient token balance.";
    case "insufficient_gas":
      return `Not enough ${NATIVE_SYMBOL} for network fees.`;
    case "gas_reserve_unknown":
      return "Network fee estimate unavailable.";
    default:
      return "Could not submit this trade.";
  }
}
