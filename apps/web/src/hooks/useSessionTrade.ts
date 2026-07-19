import type { Address, Hash } from "viem";

export type SessionBuyParams = {
  tokenAddress: Address;
  minTokenOut: bigint;
  value: bigint;
  referrer?: Address | string;
};

export type SessionSellPermit = {
  deadline: bigint;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
};

export type SessionSellParams = {
  tokenAddress: Address;
  amountWei: bigint;
  minBnbOut: bigint;
  referrer?: Address | string;
  permit?: SessionSellPermit;
};

/** @deprecated Session-key trades removed; TradePanel uses wagmi writeContract. */
export type SessionTradeHash = Hash;
