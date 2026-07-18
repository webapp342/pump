import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { kolMarketEscrowAbi } from "@/lib/abis/kol-market-escrow";
import { kolRequestIdToBytes32 } from "@/lib/kol-market-escrow";
import { pumpChain, rpcUrl } from "@/config/chain";

function escrowAddress(): `0x${string}` | null {
  const raw = process.env.NEXT_PUBLIC_KOL_MARKET_ESCROW?.trim();
  if (!raw || !raw.startsWith("0x") || raw.length !== 42) return null;
  return raw as `0x${string}`;
}

/** Release escrow to KOL after accept — best-effort when relayer key is configured. */
export async function releaseKolEscrowOnAccept(requestId: string): Promise<string | null> {
  const address = escrowAddress();
  const pk = process.env.KOL_ESCROW_RELAYER_PRIVATE_KEY?.trim() as Hex | undefined;
  if (!address || !pk) return null;

  const account = privateKeyToAccount(pk);
  const client = createWalletClient({
    account,
    chain: pumpChain,
    transport: http(rpcUrl),
  });

  const hash = await client.writeContract({
    address,
    abi: kolMarketEscrowAbi,
    functionName: "release",
    args: [kolRequestIdToBytes32(requestId)],
  });

  return hash;
}
