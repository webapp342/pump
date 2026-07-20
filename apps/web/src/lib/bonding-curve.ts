import { formatEther, formatUnits } from "viem";

export const bondingCurveManagerAbi = [
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: true },
      { name: "ethAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "feeEth", type: "uint256", indexed: false },
      { name: "reserveEth", type: "uint256", indexed: false },
      { name: "soldTokens", type: "uint256", indexed: false },
      { name: "spotPriceWei", type: "uint256", indexed: false },
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
      { name: "reserveEth", type: "uint256" },
      { name: "soldTokens", type: "uint256" },
      { name: "progressGoalEth", type: "uint256" },
      { name: "virtualEthReserve", type: "uint256" },
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
      { name: "ethIn", type: "uint256" },
    ],
    outputs: [
      { name: "tokenOut", type: "uint256" },
      { name: "feeEth", type: "uint256" },
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
      { name: "ethOut", type: "uint256" },
      { name: "feeEth", type: "uint256" },
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
    name: "buyWithReferrer",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokenOut", type: "uint256" },
      { name: "referrer", type: "address" },
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
      { name: "minEthOut", type: "uint256" },
    ],
    outputs: [{ name: "ethOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellWithPermit",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [{ name: "ethOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellWithReferrer",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
      { name: "referrer", type: "address" },
    ],
    outputs: [{ name: "ethOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellWithReferrerAndPermit",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "referrer", type: "address" },
    ],
    outputs: [{ name: "ethOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellBatch",
    inputs: [
      {
        name: "sells",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "tokenIn", type: "uint256" },
          { name: "minEthOut", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "ethOuts", type: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellBatchWithPermit",
    inputs: [
      {
        name: "sells",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "tokenIn", type: "uint256" },
          { name: "minEthOut", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "ethOuts", type: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "MAX_SELL_BATCH",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
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
    type: "event",
    name: "EmergencyEthSwept",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EmergencyHaltSet",
    inputs: [{ name: "halted", type: "bool", indexed: false }],
  },
  {
    type: "function",
    name: "emergencyHalt",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setEmergencyHalt",
    inputs: [{ name: "halted", type: "bool" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "emergencySweepAllEth",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "spotPriceWei",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
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
  realTokenReserves?: bigint;
}): bigint {
  if (params.zugIn <= 0n) return 0n;

  const feeZug = (params.zugIn * params.protocolFeeBps) / BPS;
  const netZug = params.zugIn - feeZug;
  const x0 = params.virtualZugReserve;
  const y0 = params.virtualTokenReserve;
  const k = x0 * y0;
  const y1 = k / (x0 + netZug);
  let tokenOut = y0 - y1;
  if (params.realTokenReserves != null && tokenOut > params.realTokenReserves) {
    tokenOut = params.realTokenReserves;
  }
  return tokenOut;
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

/** Spot BNB-per-token from an on-chain `curves` tuple (reserve + sold + virtual reserves). */
export function spotPriceBnbFromCurveTuple(
  reserveZug: bigint,
  soldTokens: bigint,
  virtualZugReserve: bigint,
  virtualTokenReserve: bigint
): number {
  return spotPriceZugFromReserves(
    reserveZug,
    soldTokens,
    virtualZugReserve,
    virtualTokenReserve
  );
}

/** Instantaneous spot ZUG-per-token after reserve/sold state (bonding curve marginal price). */
export function spotPriceZugFromReserves(
  reserveZug: bigint,
  soldTokens: bigint,
  virtualZugReserve: bigint = DEFAULT_VIRTUAL_ZUG_RESERVE,
  virtualTokenReserve: bigint = DEFAULT_VIRTUAL_TOKEN_RESERVE
): number {
  const poolZug = virtualZugReserve + reserveZug;
  const poolTokens = virtualTokenReserve - soldTokens;
  if (poolTokens <= 0n || poolZug <= 0n) return 0;
  return Number(poolZug) / Number(poolTokens);
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

/** Human-unit bonding constants (DB stores reserve_zug / token_sold as decimals). */
/** Matches MemeFactory `defaultVirtualEthReserve = 5 ether`. */
export const BONDING_VIRTUAL_BNB_HUMAN = 5;
export const BONDING_TOKEN_SUPPLY_HUMAN = 1_000_000_000;

/** Marginal spot BNB/token from indexer DB bonding_state decimals (chart / holders mark). */
export function spotPriceBnbFromBondingDecimals(
  reserveZug: string | number | null | undefined,
  tokenSold: string | number | null | undefined,
  virtualZugHuman: number = BONDING_VIRTUAL_BNB_HUMAN,
  virtualTokenHuman: number = BONDING_TOKEN_SUPPLY_HUMAN
): number {
  const reserve = Number(reserveZug ?? 0);
  const sold = Number(tokenSold ?? 0);
  const poolZug = virtualZugHuman + reserve;
  const poolTokens = virtualTokenHuman - sold;
  if (!Number.isFinite(poolZug) || !Number.isFinite(poolTokens) || poolTokens <= 0 || poolZug <= 0) {
    return 0;
  }
  return poolZug / poolTokens;
}

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
  /** pump.fun real_token_reserves — caps buy output (Solana). */
  realTokenReserves?: bigint;
  /** pump.fun real_sol_reserves — caps sell output (Solana). */
  realSolReserves?: bigint;
};

/** JSON-safe curve fields for passing between client components. */
export type BondingCurveSnapshot = {
  reserveZug: string;
  soldTokens: string;
  virtualZugReserve: string;
  virtualTokenReserve: string;
  paused: boolean;
  realTokenReserves?: string;
  realSolReserves?: string;
};

export function bondingCurveFromSnapshot(snapshot: BondingCurveSnapshot): BondingCurveState {
  return {
    reserveZug: BigInt(snapshot.reserveZug),
    soldTokens: BigInt(snapshot.soldTokens),
    virtualZugReserve: BigInt(snapshot.virtualZugReserve),
    virtualTokenReserve: BigInt(snapshot.virtualTokenReserve),
    realTokenReserves:
      snapshot.realTokenReserves != null ? BigInt(snapshot.realTokenReserves) : undefined,
    realSolReserves:
      snapshot.realSolReserves != null ? BigInt(snapshot.realSolReserves) : undefined,
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

/** Same math as BondingCurveManager.quoteBuy — runs locally, no RPC.
 * Solana/pump.fun: set reserveZug=0, soldTokens=0 and optional realTokenReserves cap. */
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
  let tokenOut = y0 - y1;
  if (curve.realTokenReserves != null && tokenOut > curve.realTokenReserves) {
    tokenOut = curve.realTokenReserves;
  }
  return { tokenOut, feeZug };
}

/** Same math as BondingCurveManager.quoteSell — runs locally, no RPC. */
export function quoteSellFromCurveState(
  curve: BondingCurveState,
  protocolFeeBps: bigint,
  tokenIn: bigint
): { ethOut: bigint; feeZug: bigint } {
  if (tokenIn <= 0n) return { ethOut: 0n, feeZug: 0n };

  const pumpFeel = curve.realSolReserves != null;
  const x0 = pumpFeel
    ? curve.virtualZugReserve
    : curve.virtualZugReserve + curve.reserveZug;
  const y0 = pumpFeel
    ? curve.virtualTokenReserve
    : curve.virtualTokenReserve - curve.soldTokens;
  if (y0 === 0n) return { ethOut: 0n, feeZug: 0n };

  const k = x0 * y0;
  const x1 = k / (y0 + tokenIn);
  let grossZugOut = x0 - x1;
  const realLiquidity = pumpFeel ? curve.realSolReserves! : curve.reserveZug;
  if (grossZugOut > realLiquidity) grossZugOut = realLiquidity;

  const feeZug = (grossZugOut * protocolFeeBps) / BPS;
  return { ethOut: grossZugOut - feeZug, feeZug };
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

  const pumpFeel = curve.realSolReserves != null;
  const x0 = pumpFeel
    ? curve.virtualZugReserve
    : curve.virtualZugReserve + curve.reserveZug;
  const y0 = pumpFeel
    ? curve.virtualTokenReserve
    : curve.virtualTokenReserve - curve.soldTokens;
  if (y0 === 0n || x0 === 0n) return null;

  const { ethOut: maxEthOut } = quoteSellFromCurveState(curve, protocolFeeBps, y0);
  // USD/native output mode represents an exact requested receive amount.
  // Never silently shrink it to the curve's available real liquidity: doing so
  // makes (for example) a $1 input preview a dust-sized sell.
  if (maxEthOut <= 0n || targetZugOut > maxEthOut) return null;
  const effectiveTarget = targetZugOut;

  const feeMultiplier = BPS - protocolFeeBps;
  if (feeMultiplier <= 0n) return null;

  let grossNeeded = (effectiveTarget * BPS + feeMultiplier - 1n) / feeMultiplier;
  const realLiquidity = pumpFeel ? curve.realSolReserves! : curve.reserveZug;
  if (grossNeeded > realLiquidity) grossNeeded = realLiquidity;
  if (grossNeeded <= 0n || grossNeeded >= x0) return null;

  const k = x0 * y0;
  const x1 = x0 - grossNeeded;
  if (x1 <= 0n) return null;

  let tokenIn = k / x1 - y0;
  if (tokenIn <= 0n) return null;

  for (let i = 0; i < 8; i++) {
    const { ethOut } = quoteSellFromCurveState(curve, protocolFeeBps, tokenIn);
    if (ethOut >= effectiveTarget) return tokenIn;
    tokenIn += 1n;
  }

  return null;
}
