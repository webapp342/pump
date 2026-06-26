export type PendingTradeReservation = {
  id: string;
  side: "buy" | "sell";
  /** Native wei reserved (buy spend + gas, or sell gas [+ approve]). */
  nativeReservedWei: bigint;
  /** Token wei reserved for sells. */
  tokenReservedWei: bigint;
};

export type TradePendingLedger = {
  entries: Map<string, PendingTradeReservation>;
};

export function createTradePendingLedger(): TradePendingLedger {
  return { entries: new Map() };
}

export function addPendingReservation(
  ledger: TradePendingLedger,
  reservation: PendingTradeReservation
): void {
  ledger.entries.set(reservation.id, reservation);
}

export function removePendingReservation(ledger: TradePendingLedger, id: string): void {
  ledger.entries.delete(id);
}

export function sumNativeReserved(ledger: TradePendingLedger): bigint {
  let sum = 0n;
  for (const entry of ledger.entries.values()) {
    sum += entry.nativeReservedWei;
  }
  return sum;
}

export function sumTokenReserved(ledger: TradePendingLedger): bigint {
  let sum = 0n;
  for (const entry of ledger.entries.values()) {
    sum += entry.tokenReservedWei;
  }
  return sum;
}

/** Chain balance minus all in-flight trade reservations. */
export function effectiveNativeBalance(
  ledger: TradePendingLedger,
  chainBalanceWei: bigint
): bigint {
  const reserved = sumNativeReserved(ledger);
  return chainBalanceWei > reserved ? chainBalanceWei - reserved : 0n;
}

export function effectiveTokenBalance(
  ledger: TradePendingLedger,
  chainBalanceWei: bigint
): bigint {
  const reserved = sumTokenReserved(ledger);
  return chainBalanceWei > reserved ? chainBalanceWei - reserved : 0n;
}

export function pendingTradeCount(ledger: TradePendingLedger): number {
  return ledger.entries.size;
}

/** Native balance available for a new trade, excluding other in-flight reservations. */
export function availableNativeExcluding(
  ledger: TradePendingLedger,
  chainBalanceWei: bigint,
  excludeId?: string
): bigint {
  let reserved = 0n;
  for (const [id, entry] of ledger.entries) {
    if (excludeId && id === excludeId) continue;
    reserved += entry.nativeReservedWei;
  }
  return chainBalanceWei > reserved ? chainBalanceWei - reserved : 0n;
}

export function availableTokenExcluding(
  ledger: TradePendingLedger,
  chainBalanceWei: bigint,
  excludeId?: string
): bigint {
  let reserved = 0n;
  for (const [id, entry] of ledger.entries) {
    if (excludeId && id === excludeId) continue;
    reserved += entry.tokenReservedWei;
  }
  return chainBalanceWei > reserved ? chainBalanceWei - reserved : 0n;
}
