import type { TokenSocialLinks } from "@/lib/token-social";
import { normalizeTokenAddress } from "@/lib/address";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function saveTokenMetadata(params: {
  tokenAddress: string;
  txHash: string;
  name?: string;
  symbol?: string;
  description?: string;
  socialLinks?: TokenSocialLinks;
}): Promise<void> {
  const address = normalizeTokenAddress(params.tokenAddress);
  const payload = {
    txHash: params.txHash,
    name: params.name?.trim() || undefined,
    symbol: params.symbol?.trim() || undefined,
    description: params.description?.trim() || undefined,
    socialLinks: params.socialLinks,
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`/api/tokens/${encodeURIComponent(address)}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as { error?: string };
    if (res.ok) return;

    lastError = new Error(body.error ?? "Failed to save token metadata");
    if (res.status !== 403 || attempt >= 3) break;
    await sleep(500 * (attempt + 1));
  }

  throw lastError ?? new Error("Failed to save token metadata");
}
