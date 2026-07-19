/**
 * Metaplex Token Metadata (SPL) — name/symbol/uri on-chain for explorers and other platforms.
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";

/** Metaplex on-chain field limits (DataV2). */
export const METAPLEX_NAME_MAX = 32;
export const METAPLEX_SYMBOL_MAX = 10;
export const METAPLEX_URI_MAX = 200;

export function findMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

export function clampMetaplexName(name: string): string {
  return name.trim().slice(0, METAPLEX_NAME_MAX);
}

export function clampMetaplexSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().slice(0, METAPLEX_SYMBOL_MAX);
}

export function clampMetaplexUri(uri: string): string {
  return uri.trim().slice(0, METAPLEX_URI_MAX);
}

export function buildTokenMetaplexJsonUrl(mintAddress: string, origin?: string): string {
  const base =
    origin?.replace(/\/$/, "") ??
    (typeof window !== "undefined" ? window.location.origin : "https://pump.zugchain.org");
  return `${base}/api/tokens/${encodeURIComponent(mintAddress)}/metaplex.json`;
}

export function createSplTokenMetadataInstruction(input: {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): TransactionInstruction {
  const metadata = findMetadataPda(input.mint);
  const name = clampMetaplexName(input.name);
  const symbol = clampMetaplexSymbol(input.symbol);
  const uri = clampMetaplexUri(input.uri);

  return createCreateMetadataAccountV3Instruction(
    {
      metadata,
      mint: input.mint,
      mintAuthority: input.mintAuthority,
      payer: input.payer,
      updateAuthority: input.updateAuthority,
      systemProgram: SystemProgram.programId,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name,
          symbol,
          uri,
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    }
  );
}
