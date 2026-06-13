import { formatEther, formatUnits } from "viem";

export const bondingCurveManagerAbi = [
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: true },
      { name: "zugAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "feeZug", type: "uint256", indexed: false },
      { name: "reserveZug", type: "uint256", indexed: false },
      { name: "soldTokens", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FeeSplit",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "creatorFee", type: "uint256", indexed: false },
      { name: "referrerFee", type: "uint256", indexed: false },
      { name: "treasuryFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreatorFeeClaimed",
    inputs: [
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ReferrerSet",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "referrer", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "ReferrerFeeClaimed",
    inputs: [
      { name: "referrer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "treasury",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "protocolFeeBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "creatorFeeShareBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "referrerShareBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setProtocolFeeBps",
    inputs: [{ name: "feeBps", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setCreatorFeeShareBps",
    inputs: [{ name: "shareBps", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setReferrerShareBps",
    inputs: [{ name: "shareBps", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setReferrer",
    inputs: [{ name: "referrer", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "curves",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "creator", type: "address" },
      { name: "reserveZug", type: "uint256" },
      { name: "soldTokens", type: "uint256" },
      { name: "targetZug", type: "uint256" },
      { name: "virtualZugReserve", type: "uint256" },
      { name: "virtualTokenReserve", type: "uint256" },
      { name: "paused", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteBuy",
    inputs: [
      { name: "token", type: "address" },
      { name: "zugIn", type: "uint256" },
    ],
    outputs: [
      { name: "tokenOut", type: "uint256" },
      { name: "feeZug", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteSell",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
    ],
    outputs: [
      { name: "zugOut", type: "uint256" },
      { name: "feeZug", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "buy",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokenOut", type: "uint256" },
    ],
    outputs: [{ name: "tokenOut", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "sell",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
      { name: "minZugOut", type: "uint256" },
    ],
    outputs: [{ name: "zugOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pendingCreatorFees",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pendingReferrerFees",
    inputs: [{ name: "referrer", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "traderReferrer",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasTraded",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimCreatorFees",
    inputs: [],
    outputs: [{ name: "amount", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimReferrerFees",
    inputs: [],
    outputs: [{ name: "amount", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

export const SLIPPAGE_BPS = 500n;
/** Creator share of protocol fee on each trade (BondingCurveManager.creatorFeeShareBps). */
export const CREATOR_FEE_SHARE_BPS = 2_000n;
export const CREATOR_FEE_SHARE_PCT = 20;
const BPS = 10_000n;

/** Quote for a brand-new curve (reserve=0, sold=0) — used at create time. */
export function quoteFreshBuy(params: {
  zugIn: bigint;
  virtualZugReserve: bigint;
  virtualTokenReserve: bigint;
  protocolFeeBps: bigint;
}): bigint {
  if (params.zugIn <= 0n) return 0n;

  const feeZug = (params.zugIn * params.protocolFeeBps) / BPS;
  const netZug = params.zugIn - feeZug;
  const x0 = params.virtualZugReserve;
  const y0 = params.virtualTokenReserve;
  const k = x0 * y0;
  const y1 = k / (x0 + netZug);
  return y0 - y1;
}

export function minOutWithSlippage(amount: bigint, slippageBps = SLIPPAGE_BPS): bigint {
  if (amount <= 0n) return 0n;
  return (amount * (BPS - slippageBps)) / BPS;
}

/** Marginal ZUG-per-token at a fresh curve (matches factory defaults). */
export function freshSpotPriceZug(
  virtualZugReserve: bigint,
  virtualTokenReserve: bigint
): number {
  if (virtualTokenReserve === 0n) return 0;
  return Number(virtualZugReserve) / Number(virtualTokenReserve);
}

export const DEFAULT_VIRTUAL_BNB_RESERVE = 5n * 10n ** 18n;
export const DEFAULT_VIRTUAL_ZUG_RESERVE = DEFAULT_VIRTUAL_BNB_RESERVE;
export const DEFAULT_TARGET_BNB = 2n ** 256n - 1n;
export const DEFAULT_TARGET_ZUG = DEFAULT_TARGET_BNB;
export const DEFAULT_VIRTUAL_TOKEN_RESERVE = 1_000_000_000n * 10n ** 18n;
export const DEFAULT_STARTING_SPOT_PRICE_BNB = freshSpotPriceZug(
  DEFAULT_VIRTUAL_BNB_RESERVE,
  DEFAULT_VIRTUAL_TOKEN_RESERVE
);
export const DEFAULT_STARTING_SPOT_PRICE_ZUG = DEFAULT_STARTING_SPOT_PRICE_BNB;

export function displayTokenPriceZug(lastPriceZug: string, tradeCount: number): number {
  const last = Number(lastPriceZug);
  if (last > 0) return last;
  if (tradeCount > 0) return last;
  return DEFAULT_STARTING_SPOT_PRICE_BNB;
}

export function displayTokenPriceBnb(lastPriceBnb: string, tradeCount: number): number {
  return displayTokenPriceZug(lastPriceBnb, tradeCount);
}

/** Human-readable token amounts (90081892 → "90.08M"). */
export function formatTokenAmountCompact(amount: bigint, decimals = 18): string {
  const n = Number(formatUnits(amount, decimals));
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

export function impliedStartMarketCapZug(virtualZugReserve: bigint): number {
  return Number(formatEther(virtualZugReserve));
}

export function impliedStartMarketCapBnb(virtualBnbReserve: bigint): number {
  return impliedStartMarketCapZug(virtualBnbReserve);
}

export function supplyPctForBuy(tokenOut: bigint, totalSupply: bigint): number {
  if (totalSupply === 0n) return 0;
  return Number((tokenOut * 10000n) / totalSupply) / 100;
}

/** Mirrors BondingCurveManager.curves tuple fields used in quote math. */
export type BondingCurveState = {
  reserveZug: bigint;
  soldTokens: bigint;
  virtualZugReserve: bigint;
  virtualTokenReserve: bigint;
};

/** JSON-safe curve fields for passing between client components. */
export type BondingCurveSnapshot = {
  reserveZug: string;
  soldTokens: string;
  virtualZugReserve: string;
  virtualTokenReserve: string;
  paused: boolean;
};

export function bondingCurveFromSnapshot(snapshot: BondingCurveSnapshot): BondingCurveState {
  return {
    reserveZug: BigInt(snapshot.reserveZug),
    soldTokens: BigInt(snapshot.soldTokens),
    virtualZugReserve: BigInt(snapshot.virtualZugReserve),
    virtualTokenReserve: BigInt(snapshot.virtualTokenReserve),
  };
}

export function bondingCurveSnapshotFromTuple(
  tuple: readonly [unknown, unknown, bigint, bigint, bigint, bigint, bigint, boolean]
): BondingCurveSnapshot {
  return {
    reserveZug: tuple[2].toString(),
    soldTokens: tuple[3].toString(),
    virtualZugReserve: tuple[5].toString(),
    virtualTokenReserve: tuple[6].toString(),
    paused: tuple[7],
  };
}

export function bondingCurveStateFromTuple(
  tuple: readonly [unknown, unknown, bigint, bigint, bigint, bigint, bigint, boolean]
): BondingCurveState {
  return {
    reserveZug: tuple[2],
    soldTokens: tuple[3],
    virtualZugReserve: tuple[5],
    virtualTokenReserve: tuple[6],
  };
}

/** Same math as BondingCurveManager.quoteBuy — runs locally, no RPC. */
export function quoteBuyFromCurveState(
  curve: BondingCurveState,
  protocolFeeBps: bigint,
  zugIn: bigint
): { tokenOut: bigint; feeZug: bigint } {
  if (zugIn <= 0n) return { tokenOut: 0n, feeZug: 0n };

  const feeZug = (zugIn * protocolFeeBps) / BPS;
  const netZug = zugIn - feeZug;
  const x0 = curve.virtualZugReserve + curve.reserveZug;
  const y0 = curve.virtualTokenReserve - curve.soldTokens;
  if (y0 === 0n) return { tokenOut: 0n, feeZug };

  const k = x0 * y0;
  const y1 = k / (x0 + netZug);
  return { tokenOut: y0 - y1, feeZug };
}

/** Same math as BondingCurveManager.quoteSell — runs locally, no RPC. */
export function quoteSellFromCurveState(
  curve: BondingCurveState,
  protocolFeeBps: bigint,
  tokenIn: bigint
): { zugOut: bigint; feeZug: bigint } {
  if (tokenIn <= 0n) return { zugOut: 0n, feeZug: 0n };

  const x0 = curve.virtualZugReserve + curve.reserveZug;
  const y0 = curve.virtualTokenReserve - curve.soldTokens;
  if (y0 === 0n) return { zugOut: 0n, feeZug: 0n };

  const k = x0 * y0;
  const x1 = k / (y0 + tokenIn);
  let grossZugOut = x0 - x1;
  if (grossZugOut > curve.reserveZug) grossZugOut = curve.reserveZug;

  const feeZug = (grossZugOut * protocolFeeBps) / BPS;
  return { zugOut: grossZugOut - feeZug, feeZug };
}

/**
 * Inverse of quoteBuy: BNB required to receive at least `targetTokenOut` tokens.
 * Uses constant-product curve algebra (instant) instead of on-chain binary search.
 */
export function resolveBnbInForTokenOut(
  curve: BondingCurveState,
  protocolFeeBps: bigint,
  targetTokenOut: bigint
): bigint | null {
  if (targetTokenOut <= 0n) return null;

  const x0 = curve.virtualZugReserve + curve.reserveZug;
  const y0 = curve.virtualTokenReserve - curve.soldTokens;
  if (y0 === 0n || targetTokenOut >= y0) return null;

  const y1 = y0 - targetTokenOut;
  const k = x0 * y0;
  const netZug = k / y1 - x0;
  if (netZug <= 0n) return null;

  const feeMultiplier = BPS - protocolFeeBps;
  if (feeMultiplier <= 0n) return null;

  let zugIn = (netZug * BPS + feeMultiplier - 1n) / feeMultiplier;

  for (let i = 0; i < 8; i++) {
    const { tokenOut } = quoteBuyFromCurveState(curve, protocolFeeBps, zugIn);
    if (tokenOut >= targetTokenOut) return zugIn;
    zugIn += 1n;
  }

  return null;
}

/**
 * Inverse of quoteSell: token amount required to receive at least `targetZugOut` BNB.
 */
export function resolveTokenInForBnbOut(
  curve: BondingCurveState,
  protocolFeeBps: bigint,
  targetZugOut: bigint
): bigint | null {
  if (targetZugOut <= 0n) return null;

  const x0 = curve.virtualZugReserve + curve.reserveZug;
  const y0 = curve.virtualTokenReserve - curve.soldTokens;
  if (y0 === 0n || x0 === 0n) return null;

  const feeMultiplier = BPS - protocolFeeBps;
  if (feeMultiplier <= 0n) return null;

  let grossNeeded = (targetZugOut * BPS + feeMultiplier - 1n) / feeMultiplier;
  if (grossNeeded > curve.reserveZug) grossNeeded = curve.reserveZug;
  if (grossNeeded <= 0n || grossNeeded >= x0) return null;

  const k = x0 * y0;
  const x1 = x0 - grossNeeded;
  if (x1 <= 0n) return null;

  let tokenIn = k / x1 - y0;
  if (tokenIn <= 0n) return null;

  for (let i = 0; i < 8; i++) {
    const { zugOut } = quoteSellFromCurveState(curve, protocolFeeBps, tokenIn);
    if (zugOut >= targetZugOut) return tokenIn;
    tokenIn += 1n;
  }

  return null;
}
