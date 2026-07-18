import { parseEther, type Hex } from "viem";

/** UUID → bytes32 (left-padded) for KolMarketEscrow.lock/release. */
export function kolRequestIdToBytes32(requestId: string): Hex {
  const hex = requestId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error("Invalid request id");
  }
  return `0x${hex.padStart(64, "0")}` as Hex;
}

export function usdToNativeHuman(usd: number, nativeUsd: number): number {
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(nativeUsd) || nativeUsd <= 0) {
    return 0;
  }
  return usd / nativeUsd;
}

export function usdToNativeWei(usd: number, nativeUsd: number): bigint {
  const human = usdToNativeHuman(usd, nativeUsd);
  if (human <= 0) return 0n;
  return parseEther(human.toFixed(18));
}

export function kolMarketEscrowConfigured(): boolean {
  const address = process.env.NEXT_PUBLIC_KOL_MARKET_ESCROW?.trim();
  return Boolean(address && address.startsWith("0x") && address.length === 42);
}
