import { parseEventLogs, type Hash, type PublicClient } from "viem";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAirdropCreatedFromTx(
  publicClient: PublicClient,
  txHash: Hash,
  attempts = 6
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      const events = parseEventLogs({
        abi: pumpAirdropManagerAbi,
        logs: receipt.logs,
        eventName: "AirdropCreated",
      });
      if (events[0]) return events[0];
      lastError = new Error("AirdropCreated event not found in transaction receipt");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < attempts - 1) {
      await sleep(1500);
    }
  }

  throw lastError ?? new Error("AirdropCreated event not found");
}

export async function lookupAirdropDbIdByTxHash(txHash: string): Promise<string | null> {
  const res = await fetch(`/api/airdrops/lookup?txHash=${encodeURIComponent(txHash)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { id: string } };
  return json.data?.id ?? null;
}
