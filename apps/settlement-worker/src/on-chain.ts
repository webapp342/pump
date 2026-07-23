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
  PDA_SEEDS,
  PROGRAM_IDS,
  SEASON_POOL_KIND,
  encodeCreditSeasonRewardIx,
  resolveSolanaRpcUrl,
} from "@pump/solana-sdk";

export type CreditRow = {
  wallet: string;
  lamports: bigint;
  poolKind: typeof SEASON_POOL_KIND.season | typeof SEASON_POOL_KIND.clan;
};

function pda(programId: PublicKey, seed: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], programId)[0];
}

function pdaSeasonReward(
  programId: PublicKey,
  seasonId: number,
  wallet: PublicKey
): PublicKey {
  const season = Buffer.alloc(4);
  season.writeUInt32LE(seasonId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.seasonRewards), season, wallet.toBuffer()],
    programId
  )[0];
}

function loadAuthorityKeypair(): Keypair {
  const path = process.env.SETTLEMENT_AUTHORITY_KEYPAIR?.trim();
  if (!path) {
    throw new Error("SETTLEMENT_AUTHORITY_KEYPAIR required for --credit-on-chain");
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function buildCreditIx(input: {
  programId: PublicKey;
  authority: PublicKey;
  global: PublicKey;
  sourcePool: PublicKey;
  liquidity: PublicKey;
  seasonId: number;
  beneficiary: PublicKey;
  amount: bigint;
  poolKind: CreditRow["poolKind"];
}): TransactionInstruction {
  const seasonReward = pdaSeasonReward(
    input.programId,
    input.seasonId,
    input.beneficiary
  );
  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.authority, isSigner: true, isWritable: true },
      { pubkey: input.global, isSigner: false, isWritable: false },
      { pubkey: input.sourcePool, isSigner: false, isWritable: true },
      { pubkey: input.liquidity, isSigner: false, isWritable: true },
      { pubkey: seasonReward, isSigner: false, isWritable: true },
      { pubkey: input.beneficiary, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeCreditSeasonRewardIx({
      seasonId: input.seasonId,
      amountLamports: input.amount,
      poolKind: input.poolKind,
    }),
  });
}

export async function creditSeasonAllocationsOnChain(input: {
  seasonId: number;
  rows: CreditRow[];
}): Promise<{ signatures: string[]; credited: number }> {
  const positive = input.rows.filter((row) => row.lamports > 0n);
  if (positive.length === 0) {
    return { signatures: [], credited: 0 };
  }

  const authority = loadAuthorityKeypair();
  const rpc = resolveSolanaRpcUrl({
    cluster: process.env.SOLANA_CLUSTER,
    rpcUrl: process.env.SOLANA_RPC_URL,
  });
  const conn = new Connection(rpc, "confirmed");
  const programId = new PublicKey(PROGRAM_IDS.launchpad);
  const global = pda(programId, PDA_SEEDS.global);
  const liquidity = pda(programId, PDA_SEEDS.vault);
  const seasonPool = pda(programId, PDA_SEEDS.seasonAccrual);
  const clanPool = pda(programId, PDA_SEEDS.clanPoolAccrual);

  const signatures: string[] = [];
  const chunkSize = 5;

  for (let i = 0; i < positive.length; i += chunkSize) {
    const chunk = positive.slice(i, i + chunkSize);
    const tx = new Transaction();
    for (const row of chunk) {
      const beneficiary = new PublicKey(row.wallet);
      tx.add(
        buildCreditIx({
          programId,
          authority: authority.publicKey,
          global,
          sourcePool:
            row.poolKind === SEASON_POOL_KIND.clan ? clanPool : seasonPool,
          liquidity,
          seasonId: input.seasonId,
          beneficiary,
          amount: row.lamports,
          poolKind: row.poolKind,
        })
      );
    }
    const signature = await sendAndConfirmTransaction(conn, tx, [authority], {
      commitment: "confirmed",
    });
    signatures.push(signature);
  }

  return { signatures, credited: positive.length };
}
