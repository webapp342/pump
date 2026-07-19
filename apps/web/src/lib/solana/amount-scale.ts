/**
 * Bridge Solana native units ↔ TradePanel's EVM-style 18-decimal "wei" math.
 * SOL: 9 decimals → × 10^9. SPL (pump feel): 6 decimals → × 10^12.
 */

export const SOL_DECIMALS = 9;
export const PUMP_TOKEN_DECIMALS = 6;
/** UI uses 18-decimal wei; SOL lamports → wei. */
export const SOL_TO_WEI_SCALE = 10n ** BigInt(18 - SOL_DECIMALS); // 1e9
/** SPL base units → wei. */
export const TOKEN_TO_WEI_SCALE = 10n ** BigInt(18 - PUMP_TOKEN_DECIMALS); // 1e12

/** Network fee cushion reserved in UI wei (~0.00002 SOL). */
export const SOLANA_FEE_RESERVE_WEI = 20_000n * SOL_TO_WEI_SCALE;

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
