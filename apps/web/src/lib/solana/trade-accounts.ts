/**
 * Shared buy/sell account metas — must match programs/pump-launchpad process_buy/sell.
 */

import { PublicKey, SystemProgram, type AccountMeta } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  type OnchainCurve,
  launchpadProgramId,
  pdaCreatorFees,
  pdaGlobal,
  pdaLiquidityVault,
  pdaProtocolTreasury,
  pdaReferrerBinding,
  pdaReferrerFees,
} from "@/lib/solana/launchpad-pdas";

export function solanaTradeAccountMetas(input: {
  trader: PublicKey;
  mint: PublicKey;
  curvePda: PublicKey;
  curve: OnchainCurve;
  traderAta: PublicKey;
  referrerWallet?: PublicKey;
}): AccountMeta[] {
  const programId = launchpadProgramId();
  const [globalPda] = pdaGlobal(programId);
  const [liquidity] = pdaLiquidityVault(programId);
  const [protocolTreasury] = pdaProtocolTreasury(programId);
  const [creatorFees] = pdaCreatorFees(input.curve.creator, programId);
  const referrerWallet = input.referrerWallet ?? input.trader;
  const [referrerFees] = pdaReferrerFees(referrerWallet, programId);
  const [referrerBinding] = pdaReferrerBinding(input.trader, programId);

  return [
    { pubkey: input.trader, isSigner: true, isWritable: true },
    { pubkey: globalPda, isSigner: false, isWritable: false },
    { pubkey: input.curvePda, isSigner: false, isWritable: true },
    { pubkey: liquidity, isSigner: false, isWritable: true },
    { pubkey: protocolTreasury, isSigner: false, isWritable: true },
    { pubkey: creatorFees, isSigner: false, isWritable: true },
    { pubkey: referrerFees, isSigner: false, isWritable: true },
    { pubkey: input.mint, isSigner: false, isWritable: false },
    { pubkey: input.curve.tokenVault, isSigner: false, isWritable: true },
    { pubkey: input.traderAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: referrerBinding, isSigner: false, isWritable: false },
    { pubkey: referrerWallet, isSigner: false, isWritable: true },
  ];
}
