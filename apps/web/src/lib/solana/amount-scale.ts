/**
 * Bridge Solana native units ↔ TradePanel's EVM-style 18-decimal "wei" math.
 * SOL: 9 decimals → × 10^9. SPL (pump feel): 6 decimals → × 10^12.
 */

import {
  SOLANA_BASE_TX_FEE_LAMPORTS,
} from "@pump/solana-sdk";

export const SOL_DECIMALS = 9;
export const PUMP_TOKEN_DECIMALS = 6;
/** UI uses 18-decimal wei; SOL lamports → wei. */
export const SOL_TO_WEI_SCALE = 10n ** BigInt(18 - SOL_DECIMALS); // 1e9
/** SPL base units → wei. */
export const TOKEN_TO_WEI_SCALE = 10n ** BigInt(18 - PUMP_TOKEN_DECIMALS); // 1e12

/** Standard tx fee cushion (~0.00001 SOL). No Jito/priority — pump.fun default path. */
export const SOLANA_TX_FEE_LAMPORTS = SOLANA_BASE_TX_FEE_LAMPORTS;

/** SPL associated token account rent-exempt minimum (lamports). */
export const SOLANA_ATA_RENT_LAMPORTS = 2_039_280n;

/** Sell / simple tx fee cushion in UI wei. */
export const SOLANA_FEE_RESERVE_WEI = SOLANA_TX_FEE_LAMPORTS * SOL_TO_WEI_SCALE;

/** Lamports reserved for a buy: base tx fee + ATA rent only when trader ATA is missing. */
export function solanaBuyPrefundLamports(needsTraderAta: boolean): bigint {
  return SOLANA_TX_FEE_LAMPORTS + (needsTraderAta ? SOLANA_ATA_RENT_LAMPORTS : 0n);
}

/** Buy prefund in 18-decimal wei for TradePanel gate math. */
export function solanaBuyPrefundWei(needsTraderAta: boolean): bigint {
  return lamportsToWei(solanaBuyPrefundLamports(needsTraderAta));
}

export function lamportsToWei(lamports: bigint): bigint {
  return lamports * SOL_TO_WEI_SCALE;
}

export function weiToLamports(wei: bigint): bigint {
  return wei / SOL_TO_WEI_SCALE;
}

export function tokenRawToWei(raw: bigint): bigint {
  return raw * TOKEN_TO_WEI_SCALE;
}

export function weiToTokenRaw(wei: bigint): bigint {
  return wei / TOKEN_TO_WEI_SCALE;
}
