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

/** SPL associated token account rent-exempt minimum (lamports). */
export const SOLANA_ATA_RENT_LAMPORTS = 2_039_280n;

/** System account (0 data) rent-exempt minimum — fee payer must keep this after the tx. */
export const SOLANA_WALLET_RENT_EXEMPT_LAMPORTS = 890_880n;

/** Referrer binding PDA rent (matches on-chain set_referrer CreateAccount). */
export const SOLANA_REFERRER_BINDING_RENT_LAMPORTS = 1_500_000n;

/** Buy/sell prefund: live tx fee + optional ATA/referrer rent + wallet rent dust. */
export function solanaBuyPrefundLamports(
  needsTraderAta: boolean,
  txFeeLamports: bigint,
  needsReferrerBinding = false
): bigint {
  return (
    txFeeLamports +
    (needsTraderAta ? SOLANA_ATA_RENT_LAMPORTS : 0n) +
    (needsReferrerBinding ? SOLANA_REFERRER_BINDING_RENT_LAMPORTS : 0n) +
    SOLANA_WALLET_RENT_EXEMPT_LAMPORTS
  );
}

export function solanaBuyPrefundWei(
  needsTraderAta: boolean,
  txFeeLamports: bigint,
  needsReferrerBinding = false
): bigint {
  return lamportsToWei(
    solanaBuyPrefundLamports(needsTraderAta, txFeeLamports, needsReferrerBinding)
  );
}

export function solanaSellPrefundWei(txFeeLamports: bigint): bigint {
  return lamportsToWei(txFeeLamports + SOLANA_WALLET_RENT_EXEMPT_LAMPORTS);
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
