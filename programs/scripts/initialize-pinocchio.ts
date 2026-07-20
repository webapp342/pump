/**
 * Initialize Pinocchio pump-launchpad after deploy.
 *
 *   cd programs && npx tsx scripts/initialize-pinocchio.ts
 *
 * Creates shared liquidity vault + protocol treasury (Base parity).
 * Env: SOLANA_RPC_URL / ANCHOR_PROVIDER_URL, ANCHOR_WALLET
 */

import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  PROGRAM_IDS,
  PDA_SEEDS,
  PUMP_FEEL_DEFAULTS,
  encodeInitializeIx,
} from "../../packages/solana-sdk/src/index.ts";

function loadKeypair(p: string): Keypair {
  const expanded = p.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");
  const raw = JSON.parse(readFileSync(expanded, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main(): Promise<void> {
  const dry = process.env.DRY_RUN === "1";
  const rpc =
    process.env.SOLANA_RPC_URL ||
    process.env.ANCHOR_PROVIDER_URL ||
    "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET ||
    `${process.env.HOME || process.env.USERPROFILE}/.config/solana/id.json`;

  const programId = new PublicKey(PROGRAM_IDS.launchpad);
  const payer = loadKeypair(walletPath);

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.global)],
    programId
  );
  const [factorySigner] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.factorySigner)],
    programId
  );
  const [liquidityVault] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.vault)],
    programId
  );
  const [protocolTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.protocolTreasury)],
    programId
  );

  const data = encodeInitializeIx(PUMP_FEEL_DEFAULTS);

  console.log({
    programId: programId.toBase58(),
    globalPda: globalPda.toBase58(),
    factorySigner: factorySigner.toBase58(),
    liquidityVault: liquidityVault.toBase58(),
    protocolTreasury: protocolTreasury.toBase58(),
    rpc,
  });

  if (dry) {
    console.log("DRY_RUN=1 — skip send");
    return;
  }

  const connection = new Connection(rpc, "confirmed");
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: liquidityVault, isSigner: false, isWritable: true },
      { pubkey: protocolTreasury, isSigner: false, isWritable: true },
      { pubkey: factorySigner, isSigner: false, isWritable: false },
      { pubkey: globalPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [payer]
  );
  console.log("initialize ok", sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
