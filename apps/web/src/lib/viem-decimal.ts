import { parseEther, parseUnits } from "viem";

const SCIENTIFIC = /[eE]/;

/**
 * viem parseUnits/parseEther reject scientific notation (e.g. `1e-9`, `4.342e-9`).
 * DB spot/reserve fields may arrive in exponent form from JS or PostgreSQL float text.
 */
export function toViemDecimalString(
  value: string | number | null | undefined,
  fractionDigits = 18
): string {
  if (value == null) return "0";
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return "0";

  if (typeof raw === "string" && !SCIENTIFIC.test(raw) && /^-?\d+(\.\d+)?$/.test(raw)) {
    return raw;
  }

  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";

  const fixed = n.toFixed(fractionDigits);
  return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") || "0";
}

export function parseUnitsDecimal(
  value: string | number | null | undefined,
  decimals: number
): bigint {
  return parseUnits(toViemDecimalString(value, decimals), decimals);
}

export function parseEtherDecimal(value: string | number | null | undefined): bigint {
  return parseEther(toViemDecimalString(value, 18));
}
