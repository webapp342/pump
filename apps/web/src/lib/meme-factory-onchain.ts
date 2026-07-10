import { createPublicClient, formatEther, http } from "viem";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import { contracts, pumpChain, rpcUrl } from "@/config/chain";

const publicClient = createPublicClient({
  chain: pumpChain,
  transport: http(rpcUrl, { timeout: 20_000 }),
});

/** On-chain minimum initial buy (BNB). Falls back when the field is unset or unreadable. */
export async function readMinInitialBuyBnb(): Promise<string> {
  try {
    const wei = await publicClient.readContract({
      address: contracts.memeFactory,
      abi: memeFactoryAbi,
      functionName: "minInitialBuyWei",
    });
    if (wei > 0n) return formatEther(wei);
    return "0";
  } catch {
    return "0";
  }
}
