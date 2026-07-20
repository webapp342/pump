import { normalizeRouteAddressKey } from "@/lib/address";

/** Token detail href — preserve Solana base58 case (never lowercase). */
export function tokenDetailPath(address: string): string {
  return `/token/${encodeURIComponent(normalizeRouteAddressKey(address))}`;
}
