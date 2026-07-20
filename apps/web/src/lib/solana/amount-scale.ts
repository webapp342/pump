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

/**
 * Pending creator/referrer fees PDA funding.
 * 48-byte network minimum is 1_224_960 lamports; program funds 1_300_000.
 */
export const SOLANA_PENDING_FEES_RENT_LAMPORTS = 1_300_000n;

/**
 * Slack for fee schedule drift between getFeeForMessage and the signed tx.
 * Keeps Max slightly under the absolute ceiling so rent checks don't flake.
 */
export const SOLANA_BUY_FEE_SLACK_LAMPORTS = 50_000n;

export type SolanaBuyPrefundOptions = {
  needsTraderAta?: boolean;
  needsReferrerBinding?: boolean;
  /** First trade that accrues creator fees creates the creator-fees PDA (paid by trader). */
  needsCreatorFeesPda?: boolean;
  /** First accrual to a referrer creates the referrer-fees PDA (paid by trader). */
  needsReferrerFeesPda?: boolean;
  /** Extra lamports buffer (default SOLANA_BUY_FEE_SLACK_LAMPORTS). */
  slackLamports?: bigint;
};

/** Buy prefund: live tx fee + rents only for accounts this buy actually creates + slack. */
export function solanaBuyPrefundLamports(
  txFeeLamports: bigint,
  options: SolanaBuyPrefundOptions = {}
): bigint {
  const {
    needsTraderAta = false,
    needsReferrerBinding = false,
    needsCreatorFeesPda = false,
    needsReferrerFeesPda = false,
    slackLamports = SOLANA_BUY_FEE_SLACK_LAMPORTS,
  } = options;

  return (
    txFeeLamports +
    (needsTraderAta ? SOLANA_ATA_RENT_LAMPORTS : 0n) +
    (needsReferrerBinding ? SOLANA_REFERRER_BINDING_RENT_LAMPORTS : 0n) +
    (needsCreatorFeesPda ? SOLANA_PENDING_FEES_RENT_LAMPORTS : 0n) +
    (needsReferrerFeesPda ? SOLANA_PENDING_FEES_RENT_LAMPORTS : 0n) +
    slackLamports
  );
}

export function solanaBuyPrefundWei(
  txFeeLamports: bigint,
  options: SolanaBuyPrefundOptions = {}
): bigint {
  return lamportsToWei(solanaBuyPrefundLamports(txFeeLamports, options));
}

/**
 * Sell prefund: signature fee + slack only.
 * Do NOT reserve wallet rent-exempt here — sells credit SOL and never create
 * trader accounts; requiring ~0.00089 SOL (~$0.10+) falsely opens Deposit on
 * dust wallets that can still pay a ~5k–50k lamport fee.
 */
export function solanaSellPrefundLamports(txFeeLamports: bigint): bigint {
  return txFeeLamports + SOLANA_BUY_FEE_SLACK_LAMPORTS;
}

export function solanaSellPrefundWei(txFeeLamports: bigint): bigint {
  return lamportsToWei(solanaSellPrefundLamports(txFeeLamports));
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
