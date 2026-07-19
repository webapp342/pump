import type { TokenSocialLinks } from "@/lib/token-social";
import { normalizeTokenAddress } from "@/lib/address";

export async function saveTokenMetadata(params: {
  tokenAddress: string;
  txHash: string;
  name?: string;
  symbol?: string;
  description?: string;
  socialLinks?: TokenSocialLinks;
}): Promise<void> {
  const address = normalizeTokenAddress(params.tokenAddress);
  const res = await fetch(`/api/tokens/${encodeURIComponent(address)}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      txHash: params.txHash,
      name: params.name?.trim() || undefined,
      symbol: params.symbol?.trim() || undefined,
      description: params.description?.trim() || undefined,
      socialLinks: params.socialLinks,
    }),
  });

  const body = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to save token metadata");
  }
}
