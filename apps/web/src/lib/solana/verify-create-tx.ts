import { Connection } from "@solana/web3.js";
import { PROGRAM_IDS, resolveSolanaRpcUrl } from "@pump/solana-sdk";
import { FACTORY_EVENTS } from "@pump/solana-sdk";
import { extractEventsFromLogs } from "@/lib/solana/decode-events";
import { normalizeTokenAddress } from "@/lib/address";

export async function verifySolanaCreateTx(
  mintAddress: string,
  txSignature: string
): Promise<{ creator: string; slot: number } | null> {
  const mint = normalizeTokenAddress(mintAddress);
  const signature = txSignature.trim();
  if (!signature) return null;

  const rpc = resolveSolanaRpcUrl({
    cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? process.env.SOLANA_RPC_URL,
  });
  const conn = new Connection(rpc, "confirmed");

  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = await conn.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (tx?.meta?.logMessages?.length) {
      const events = extractEventsFromLogs({
        logs: tx.meta.logMessages,
        signature,
        slot: tx.slot,
        programId: PROGRAM_IDS.launchpad,
      });
      const created = events.find((e) => e.name === FACTORY_EVENTS.TokenCreated && e.fields);
      if (!created?.fields) return null;
      if (String(created.fields.mint) !== mint) return null;

      return {
        creator: String(created.fields.creator),
        slot: tx.slot,
      };
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  return null;
}
