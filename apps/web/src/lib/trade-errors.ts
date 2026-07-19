import { NATIVE_SYMBOL } from "@/config/chain";

export function formatTradeError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "shortMessage" in err
        ? String((err as { shortMessage: string }).shortMessage)
        : String(err);

  const lower = raw.toLowerCase();

  if (lower.includes("failed to get user operation receipt") || lower.includes("timed out while waiting for user operation")) {
    return "Transaction submitted — confirmation is slow. Check the Airdrops board in a minute, or retry if nothing appears.";
  }
  if (lower.includes("maxfeepergas must be at least") || lower.includes("pimlico_getuseroperationgasprice")) {
    return "Gas price too low for the bundler — wait a moment and try again.";
  }
  if (lower.includes("validateuserop") || lower.includes("aa23") || lower.includes("-32500")) {
    return `Transaction rejected (AA23) — deposit ${NATIVE_SYMBOL} to your smart wallet address (not login wallet) for trade amount + gas, then retry.`;
  }
  if (lower.includes("user rejected") || lower.includes("user denied")) {
    return "Transaction cancelled in wallet.";
  }

  // Prefer our live preflight message (already human-readable).
  if (lower.startsWith("insufficient funds: wallet has")) {
    return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  }

  if (lower.includes("token vault is empty")) {
    return raw;
  }

  // SPL token "insufficient funds" is NOT a SOL balance problem (vault/ATA).
  if (
    lower.includes("insufficient funds") &&
    (lower.includes("token") || lower.includes("custom program error: 0x1"))
  ) {
    return "Token transfer failed — vault or token account has no balance. Refresh and try again.";
  }

  if (
    lower.includes("insufficient funds for rent") ||
    lower.includes("insufficientfundsforrent")
  ) {
    return `Not enough ${NATIVE_SYMBOL} left for rent after this trade. Lower the amount slightly.`;
  }

  if (
    lower.includes("insufficient funds") ||
    (lower.includes("insufficient") && lower.includes(NATIVE_SYMBOL.toLowerCase()))
  ) {
    return `Not enough ${NATIVE_SYMBOL} for this trade (amount + network fee).`;
  }

  if (
    lower.includes("smart account does not have sufficient funds") ||
    lower.includes("required prefund")
  ) {
    return `Smart wallet needs more ${NATIVE_SYMBOL} for trade amount + UserOp gas. Deposit via Wallet → Deposit, or lower the buy amount.`;
  }
  if (lower.includes("pausedorgraduated") || lower.includes("paused()")) {
    return "Trading is closed for this token.";
  }
  if (lower.includes("unknowntoken")) {
    return "This token is not registered on the bonding curve. Check contract addresses.";
  }
  if (lower.includes("slippage")) {
    return "Price moved — try again with a smaller amount.";
  }
  if (lower.includes("insufficientoutput")) {
    return "Trade amount too small after fees.";
  }
  if (lower.includes("insufficientallowance")) {
    return "Token approval missing — approve again, then sell.";
  }
  if (lower.includes("insufficientbalance") || lower.includes("0xf4d678b8")) {
    return "Insufficient token balance — refresh the page or wait for your last sell to confirm.";
  }
  if (lower.includes("transferfailed")) {
    return "Token transfer failed — check balance and approval.";
  }
  if (lower.includes("popup_closed") || lower.includes("popup closed")) {
    return "Sign-in was cancelled. Try again.";
  }

  return raw.length > 180 ? `${raw.slice(0, 180)}…` : raw;
}
