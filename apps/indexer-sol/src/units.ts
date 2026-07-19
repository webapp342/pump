import {
  NATIVE_DECIMALS,
  PUMP_FEEL_DEFAULTS,
  SPOT_PRICE_TOKEN_UNIT,
} from "@pump/solana-sdk";

/** Format integer base units as a decimal string (no scientific notation). */
export function formatUnits(value: bigint, decimals: number): string {
  if (decimals < 0) throw new Error("decimals must be >= 0");
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return neg ? `-${body}` : body;
}

export function lamportsToSol(lamports: bigint): string {
  return formatUnits(lamports, NATIVE_DECIMALS);
}

export function tokenAmountToDecimal(
  amount: bigint,
  decimals: number = PUMP_FEEL_DEFAULTS.tokenDecimals
): string {
  return formatUnits(amount, decimals);
}

/** SOL per whole token from trade amounts. */
export function executionPriceSol(
  solLamports: bigint,
  tokenAmount: bigint,
  tokenDecimals: number = PUMP_FEEL_DEFAULTS.tokenDecimals
): string {
  if (tokenAmount === 0n) return "0";
  // (sol/1e9) / (tok/10^d) = sol * 10^d / (tok * 1e9)
  const scale = 18n;
  const numer = solLamports * 10n ** BigInt(tokenDecimals) * 10n ** scale;
  const denom = tokenAmount * 10n ** BigInt(NATIVE_DECIMALS);
  const scaled = numer / denom;
  return formatUnits(scaled, Number(scale));
}

/**
 * On-chain spot_price = (poolSolLamports * TOKEN_UNIT_9) / poolTokenBase.
 * Convert to SOL per whole token (10^tokenDecimals base units).
 */
export function spotPriceSolPerToken(
  spotPriceU64: bigint,
  tokenDecimals: number = PUMP_FEEL_DEFAULTS.tokenDecimals
): string {
  if (spotPriceU64 === 0n) return "0";
  // SOL/whole = spot * 10^d / (TOKEN_UNIT_9 * 1e9)
  const scale = 18n;
  const numer =
    spotPriceU64 * 10n ** BigInt(tokenDecimals) * 10n ** scale;
  const denom = SPOT_PRICE_TOKEN_UNIT * 10n ** BigInt(NATIVE_DECIMALS);
  const scaled = numer / denom;
  return formatUnits(scaled, Number(scale));
}

export function startingSpotFromVirtual(
  virtualSolLamports: bigint,
  virtualTokenReserve: bigint,
  tokenDecimals: number = PUMP_FEEL_DEFAULTS.tokenDecimals
): string {
  if (virtualTokenReserve === 0n) return "0";
  return executionPriceSol(virtualSolLamports, virtualTokenReserve, tokenDecimals);
}

/** FDV-style mcap in SOL for 1B whole tokens (matches EVM indexer * 1e9). */
export function marketCapSolFromSpot(spotSolPerToken: string): string {
  const price = Number(spotSolPerToken);
  if (!Number.isFinite(price) || price <= 0) return "0";
  return String(price * 1_000_000_000);
}

export function asBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string") return BigInt(v);
  throw new Error(`expected bigint-compatible, got ${typeof v}`);
}

export function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  throw new Error(`expected string-compatible, got ${typeof v}`);
}

export function asBool(v: unknown): boolean {
  return Boolean(v);
}

export function eventId(signature: string, logIndex: number): string {
  return `${signature}:${logIndex}`;
}

export function feeSplitKey(signature: string, mint: string): string {
  return `${signature}:${mint}`;
}
