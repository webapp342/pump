/**
 * Initialize pump-treasury → pump-curve → pump-factory with PUMP_FEEL_DEFAULTS.
 *
 * Prerequisites:
 *   1. `anchor build && anchor deploy` (IDLs under target/idl/)
 *   2. From `programs/`: `npm install` (see package.json) then:
 *        npx tsx scripts/initialize.ts
 *
 * Env:
 *   ANCHOR_PROVIDER_URL  — RPC (default https://api.devnet.solana.com)
 *   ANCHOR_WALLET        — keypair path (default ~/.config/solana/id.json)
 *   TREASURY_VAULT_OVERRIDE — optional pubkey if vault PDA derivation differs
 *
 * Dry-run (print args only):
 *   DRY_RUN=1 npx tsx scripts/initialize.ts
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnchorProvider,
  Program,
  setProvider,
  type Idl,
} from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const programsRoot = path.resolve(__dirname, "..");

/** Keep in sync with @pump/solana-sdk PUMP_FEEL_DEFAULTS */
const PUMP_FEEL_DEFAULTS = {
  tokenDecimals: 6,
  totalSupply: new BN("1000000000000000"),
  virtualSolLamports: new BN("30000000000"),
  createFeeLamports: new BN(0),
  protocolFeeBps: new BN(100),
  creatorFeeShareBps: new BN(5_000),
  referrerShareBps: new BN(1_000),
  verifiedReferrerShareBps: new BN(2_000),
};

const PROGRAM_IDS = {
  factory: new PublicKey("FJs6MkZtwcS9p7UrxKmL2twAdECGNJk4s1MffXMSZmqF"),
  curve: new PublicKey("28AYQYZW7J9gkYcDJiebYCfXKYuyFEr2xNn7xKwAsZer"),
  treasury: new PublicKey("8aT5qz6nPYCVCX1ZJBxfyCD46u46XY7dymBtRp3Jy5kq"),
};

const GLOBAL_SEED = Buffer.from("global");
const VAULT_SEED = Buffer.from("vault");
const FACTORY_SIGNER_SEED = Buffer.from("factory-signer");

function loadIdl(name: string): Idl {
  const p = path.join(programsRoot, "target", "idl", `${name}.json`);
  if (!existsSync(p)) {
    throw new Error(`Missing IDL ${p} — run \`anchor build\` first`);
  }
  return JSON.parse(readFileSync(p, "utf8")) as Idl;
}

function pda(programId: PublicKey, seeds: Buffer[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  console.log("PUMP_FEEL_DEFAULTS → initialize");
  console.log({
    createFeeLamports: PUMP_FEEL_DEFAULTS.createFeeLamports.toString(),
    virtualSol: PUMP_FEEL_DEFAULTS.virtualSolLamports.toString(),
    virtualToken: PUMP_FEEL_DEFAULTS.totalSupply.toString(),
    totalSupply: PUMP_FEEL_DEFAULTS.totalSupply.toString(),
    decimals: PUMP_FEEL_DEFAULTS.tokenDecimals,
    protocolFeeBps: PUMP_FEEL_DEFAULTS.protocolFeeBps.toString(),
  });

  if (dryRun) {
    console.log("DRY_RUN=1 — skipping on-chain txs");
    return;
  }

  const provider = AnchorProvider.env();
  setProvider(provider);
  const authority = provider.wallet.publicKey;

  const [treasuryGlobal] = pda(PROGRAM_IDS.treasury, [GLOBAL_SEED]);
  const [treasuryVault] = pda(PROGRAM_IDS.treasury, [VAULT_SEED]);
  const [curveGlobal] = pda(PROGRAM_IDS.curve, [GLOBAL_SEED]);
  const [factoryGlobal] = pda(PROGRAM_IDS.factory, [GLOBAL_SEED]);
  const [factorySigner] = pda(PROGRAM_IDS.factory, [FACTORY_SIGNER_SEED]);

  const treasuryIdl = loadIdl("pump_treasury");
  const curveIdl = loadIdl("pump_curve");
  const factoryIdl = loadIdl("pump_factory");
  // Anchor 0.31: Program(idl, provider); address lives on IDL
  treasuryIdl.address = PROGRAM_IDS.treasury.toBase58();
  curveIdl.address = PROGRAM_IDS.curve.toBase58();
  factoryIdl.address = PROGRAM_IDS.factory.toBase58();

  const treasury = new Program(treasuryIdl, provider);
  const curve = new Program(curveIdl, provider);
  const factory = new Program(factoryIdl, provider);

  console.log("1/3 treasury.initialize…");
  await treasury.methods
    .initialize()
    .accounts({
      authority,
      global: treasuryGlobal,
      vault: treasuryVault,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("2/3 curve.initialize…");
  await curve.methods
    .initialize(
      PUMP_FEEL_DEFAULTS.protocolFeeBps,
      PUMP_FEEL_DEFAULTS.creatorFeeShareBps,
      PUMP_FEEL_DEFAULTS.referrerShareBps,
      PUMP_FEEL_DEFAULTS.verifiedReferrerShareBps
    )
    .accounts({
      authority,
      treasury: treasuryVault,
      factorySigner,
      global: curveGlobal,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("3/3 factory.initialize…");
  await factory.methods
    .initialize(
      PUMP_FEEL_DEFAULTS.createFeeLamports,
      PUMP_FEEL_DEFAULTS.virtualSolLamports,
      PUMP_FEEL_DEFAULTS.totalSupply,
      PUMP_FEEL_DEFAULTS.totalSupply,
      PUMP_FEEL_DEFAULTS.tokenDecimals
    )
    .accounts({
      authority,
      curveProgram: PROGRAM_IDS.curve,
      treasury: treasuryVault,
      global: factoryGlobal,
      factorySigner,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Done. Globals:");
  console.log({
    treasuryGlobal: treasuryGlobal.toBase58(),
    curveGlobal: curveGlobal.toBase58(),
    factoryGlobal: factoryGlobal.toBase58(),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
